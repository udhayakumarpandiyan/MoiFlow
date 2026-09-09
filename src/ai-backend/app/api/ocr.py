"""
OCR endpoint — processes invitation images and extracts event details.

Uses Tesseract (pytesseract + Pillow) with Tamil + English language packs.
Falls back gracefully when Tesseract is not installed.
"""

import io
import logging
import os
import re
from datetime import date as date_cls
from typing import Optional

from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class OCRResponse(BaseModel):
    raw_text: str
    event_name: Optional[str] = None
    date: Optional[str] = None
    venue: Optional[str] = None
    confidence: float = 0.0


# ---------------------------------------------------------------------------
# Tamil / English event keywords
# ---------------------------------------------------------------------------

EVENT_TYPE_KEYWORDS = [
    "திருமணம்",
    "காதணி",
    "பிறந்தநாள்",
    "முப்பூசை",
    "புதுமனை",
    "கருமகாரியம்",
    "மஞ்சள் நீராட்டு",
    "wedding",
    "marriage",
    "birthday",
    "housewarming",
]

TAMIL_MONTHS = [
    ("ஜனவரி", "01"), ("பிப்ரவரி", "02"), ("மார்ச்", "03"),
    ("ஏப்ரல்", "04"), ("மே", "05"), ("ஜூன்", "06"),
    ("ஜூலை", "07"), ("ஆகஸ்ட்", "08"), ("செப்டம்பர்", "09"),
    ("அக்டோபர்", "10"), ("நவம்பர்", "11"), ("டிசம்பர்", "12"),
]

VENUE_INDICATORS = ["ஹால்", "மண்டபம்", "இடம்", "hall", "mandapam", "mahal"]


# ---------------------------------------------------------------------------
# Extraction helpers
# ---------------------------------------------------------------------------

def extract_event_name(text: str) -> Optional[str]:
    lower = text.lower()
    for keyword in EVENT_TYPE_KEYWORDS:
        if keyword in lower:
            return keyword
    return None


def extract_date(text: str) -> Optional[str]:
    current_year = str(date_cls.today().year)

    # DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY
    m = re.search(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", text)
    if m:
        day = m.group(1).zfill(2)
        month = m.group(2).zfill(2)
        return f"{m.group(3)}-{month}-{day}"

    # YYYY-MM-DD
    m = re.search(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", text)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"

    # Tamil month names
    for tamil_month, month_num in TAMIL_MONTHS:
        m = re.search(rf"(\d{{1,2}})\s*{tamil_month}(?:\s*(\d{{4}}))?", text)
        if m:
            day = m.group(1).zfill(2)
            year = m.group(2) or current_year
            return f"{year}-{month_num}-{day}"

    return None


def extract_venue(text: str) -> Optional[str]:
    lower = text.lower()
    for indicator in VENUE_INDICATORS:
        idx = lower.find(indicator.lower())
        if idx != -1:
            after = text[idx + len(indicator):].strip()
            m = re.match(r"^[^,.\n]+", after)
            venue = m.group(0).strip() if m else after.split("\n")[0].strip()
            if venue:
                return f"{text[idx:idx + len(indicator)]} {venue}".strip()
    return None


def compute_confidence(
    event_name: Optional[str],
    date: Optional[str],
    venue: Optional[str],
) -> float:
    fields = sum(1 for f in [event_name, date, venue] if f is not None)
    if fields >= 2:
        return 0.8
    if fields == 1:
        return 0.5
    return 0.2


# ---------------------------------------------------------------------------
# Tesseract availability check
# ---------------------------------------------------------------------------

try:
    import pytesseract
    from PIL import Image as PILImage
    from PIL import ImageOps, ImageFilter
    TESSERACT_AVAILABLE = True

    # Allow pointing at the Tesseract binary explicitly (Windows installs it
    # outside PATH by default). Set TESSERACT_CMD in .env, e.g.
    #   TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
    _tesseract_cmd = os.getenv("TESSERACT_CMD")
    if _tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = _tesseract_cmd

    # Optional: directory containing traineddata (tam.traineddata, eng.traineddata).
    _tessdata_dir = os.getenv("TESSDATA_PREFIX")
    if _tessdata_dir:
        os.environ.setdefault("TESSDATA_PREFIX", _tessdata_dir)
except ImportError:
    TESSERACT_AVAILABLE = False
    logger.warning(
        "pytesseract or Pillow not installed — OCR endpoint will return empty results. "
        "Install with: pip install pytesseract Pillow"
    )


# Google Cloud Vision (best handwriting engine when configured).
# DOCUMENT_TEXT_DETECTION handles handwritten Tamil far better than Tesseract.
# Set GOOGLE_VISION_API_KEY in .env to enable it; otherwise we fall back to the
# offline engines automatically.
GOOGLE_VISION_API_KEY = os.getenv("GOOGLE_VISION_API_KEY", "").strip()
GOOGLE_VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate"


# EasyOCR (offline, pip-installable, bundles a Tamil model — no system binary
# and no cloud key required). This is the default working engine so the feature
# functions out of the box. The reader is created lazily and cached because the
# first initialization downloads the model and is expensive.
try:
    import easyocr  # noqa: F401
    import numpy as _np  # easyocr consumes numpy arrays
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False

# Disable EasyOCR explicitly via env if desired (e.g. low-memory hosts).
EASYOCR_ENABLED = os.getenv("EASYOCR_ENABLED", "1").strip() not in ("0", "false", "False", "")

_easyocr_reader = None
# Once EasyOCR fails to initialize (e.g. the known upstream Tamil model/config
# mismatch), we cache that fact so we don't repeatedly pay the expensive—and
# doomed—model load on every request.
_easyocr_init_failed = False


def _get_easyocr_reader():
    """
    Lazily create and cache an EasyOCR reader.

    Tries Tamil+English first. EasyOCR 1.7.x ships a broken Tamil recognizer
    (its config character set has 127 symbols but the released tamil.pth model
    expects 143), which raises a size-mismatch RuntimeError on load. When that
    happens we fall back to an English-only reader (which loads reliably) so the
    endpoint still extracts the English initials, village spellings written in
    English, and — most importantly — the numeric cash/gold amounts. Returns
    None if even that fails.
    """
    global _easyocr_reader, _easyocr_init_failed
    if _easyocr_reader is not None or _easyocr_init_failed:
        return _easyocr_reader

    # gpu=False keeps it portable; models auto-download on first use.
    try:
        _easyocr_reader = easyocr.Reader(["ta", "en"], gpu=False, verbose=False)
        logger.info("EasyOCR initialized with Tamil+English.")
        return _easyocr_reader
    except Exception:
        logger.warning(
            "EasyOCR Tamil model failed to load (known upstream tamil.pth "
            "character-set mismatch in easyocr<=1.7.2). Falling back to an "
            "English-only reader; Tamil glyphs will not be recognized. For "
            "accurate Tamil handwriting, set GOOGLE_VISION_API_KEY.",
            exc_info=True,
        )

    try:
        _easyocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        logger.info("EasyOCR initialized with English only (Tamil unavailable).")
        return _easyocr_reader
    except Exception:
        _easyocr_init_failed = True
        logger.exception("EasyOCR failed to initialize entirely; disabling it.")
        return None


def _preprocess_for_handwriting(image):
    """
    Prepare a photo of a handwritten page for OCR.

    Steps: fix EXIF orientation, convert to grayscale, upscale small images,
    autocontrast, and sharpen. These noticeably improve Tesseract recall on
    phone photos of notebook pages, which is what drives "all rows" extraction.
    """
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        pass

    # Grayscale + contrast normalization.
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray, cutoff=2)

    # Upscale small images so thin handwriting strokes survive binarization.
    min_side = min(gray.size)
    if min_side < 1200:
        scale = 1200 / float(min_side)
        new_size = (int(gray.size[0] * scale), int(gray.size[1] * scale))
        gray = gray.resize(new_size, PILImage.LANCZOS)

    gray = gray.filter(ImageFilter.SHARPEN)
    return gray


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/process", response_model=OCRResponse)
async def process_image(file: UploadFile = File(...)):
    """
    Process an invitation image and extract event details.

    Uses Tesseract OCR (tam+eng) then regex-based parsing for
    Tamil event keywords, dates, and venue indicators.
    """
    if not TESSERACT_AVAILABLE:
        logger.error("OCR request received but pytesseract/Pillow are not installed.")
        return OCRResponse(
            raw_text="OCR backend dependencies not installed (pytesseract, Pillow).",
            confidence=0.0,
        )

    try:
        contents = await file.read()
        image = PILImage.open(io.BytesIO(contents))

        raw_text: str = pytesseract.image_to_string(image, lang="tam+eng")

        if not raw_text.strip():
            logger.info("OCR returned no text for uploaded image.")
            return OCRResponse(
                raw_text="No text detected in image.",
                confidence=0.1,
            )

        event_name = extract_event_name(raw_text)
        date = extract_date(raw_text)
        venue = extract_venue(raw_text)
        confidence = compute_confidence(event_name, date, venue)

        logger.info(
            "OCR processed image: event_name=%s date=%s venue=%s confidence=%.2f",
            event_name, date, venue, confidence,
        )

        return OCRResponse(
            raw_text=raw_text,
            event_name=event_name,
            date=date,
            venue=venue,
            confidence=confidence,
        )

    except Exception:
        logger.exception("OCR processing failed for uploaded image.")
        return OCRResponse(
            raw_text="OCR processing failed. Please try again.",
            confidence=0.0,
        )


# ---------------------------------------------------------------------------
# Handwritten Tamil IN-entry extraction (notebook page → multiple entries)
# ---------------------------------------------------------------------------

class HandwrittenEntry(BaseModel):
    name: Optional[str] = None
    village: Optional[str] = None
    cash_amount: float = 0.0
    gold_weight: float = 0.0
    confidence: float = 0.0
    raw_line: str = ""


class HandwrittenEntriesResponse(BaseModel):
    raw_text: str
    entries: list[HandwrittenEntry] = []
    count: int = 0


# Cash / gold unit keywords used to split the amount portion of a line.
_CASH_UNITS = ("ரூபாய்", "ரூபா", "ரூ", "rs", "rupees", "rupee")
_GOLD_UNITS = ("கிராம்", "கிராம", "gram", "grams", "gm", "g", "பவுன்", "sovereign")

# Village indicator keywords — text following these is treated as village.
_VILLAGE_HINTS = ("ஊர்", "ஊரு", "கிராமம்", "village")


def _parse_amount_token(token: str) -> float:
    """Parse a numeric token like '1,000' or '500.5' into a float."""
    cleaned = re.sub(r"[^\d.]", "", token.replace(",", ""))
    if not cleaned:
        return 0.0
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _parse_handwritten_line(line: str) -> Optional[HandwrittenEntry]:
    """
    Parse a single handwritten notebook line into an IN entry.

    Expected loose formats (Tamil handwriting, one entry per line):
        "கண்ணன் முத்தூர் 1000"
        "ராஜா 500 ரூபாய்"
        "செல்வி சேலம் 2 கிராம்"
        "முருகன் 1000 மற்றும் 1 கிராம்"

    Heuristic: names/villages are non-numeric tokens (left side); the numeric
    tokens with optional cash/gold units are the amounts (right side).
    """
    original = line.strip()
    if not original:
        return None

    # Skip pure separator / noise lines (page rules, lone punctuation) but keep
    # anything containing a letter or digit so no genuine row is dropped.
    if not re.search(r"[^\W_]", original, flags=re.UNICODE):
        return None
    alnum_count = len(re.findall(r"[^\W_]", original, flags=re.UNICODE))
    if alnum_count < 2 and not re.search(r"\d", original):
        return None

    lower = original.lower()

    cash = 0.0
    gold = 0.0

    # Explicit gold: number followed by a gold unit
    gold_match = re.search(
        r"(\d+(?:[.,]\d+)?)\s*(?:கிராம்|கிராம|gram[s]?|gm|பவுன்|sovereign)",
        lower,
    )
    if gold_match:
        gold = _parse_amount_token(gold_match.group(1))

    # Explicit cash: number followed by a cash unit
    cash_match = re.search(
        r"(\d+(?:[.,]\d+)?)\s*(?:ரூபாய்|ரூபா|ரூ|rs\.?|rupees?)",
        lower,
    )
    if cash_match:
        cash = _parse_amount_token(cash_match.group(1))

    # Collect all numbers in the line to fall back on when units are absent.
    numbers = re.findall(r"\d+(?:[.,]\d+)?", original)

    if cash == 0.0 and not cash_match:
        # No explicit cash unit. If there's a number that isn't the gold value,
        # treat the largest remaining number as cash (common for notebook moi).
        candidates = [_parse_amount_token(n) for n in numbers]
        candidates = [c for c in candidates if c != gold]
        if candidates:
            cash = max(candidates)

    # Identity tokens = tokens without digits and not unit keywords.
    tokens = original.split()
    identity_tokens: list[str] = []
    for tok in tokens:
        tl = tok.lower()
        if re.search(r"\d", tok):
            continue
        if any(u in tl for u in _CASH_UNITS) or any(u in tl for u in _GOLD_UNITS):
            continue
        if tl in ("மற்றும்", "and", "உம்"):
            continue
        identity_tokens.append(tok)

    name: Optional[str] = None
    village: Optional[str] = None

    if identity_tokens:
        # Strip explicit village-hint markers, capturing the village if present.
        cleaned_tokens: list[str] = []
        for i, tok in enumerate(identity_tokens):
            if any(h in tok.lower() for h in _VILLAGE_HINTS):
                # token itself is a hint; the previous token may be the village
                continue
            cleaned_tokens.append(tok)

        if len(cleaned_tokens) >= 2:
            name = cleaned_tokens[0]
            village = " ".join(cleaned_tokens[1:])
        elif len(cleaned_tokens) == 1:
            name = cleaned_tokens[0]

    # Confidence: needs at least a name and an amount to be useful.
    has_amount = cash > 0 or gold > 0
    if name and has_amount and village:
        confidence = 0.8
    elif name and has_amount:
        confidence = 0.6
    elif has_amount or name:
        confidence = 0.4
    else:
        confidence = 0.2

    # Skip lines with neither a name nor an amount.
    if not name and not has_amount:
        return None

    return HandwrittenEntry(
        name=name,
        village=village,
        cash_amount=cash,
        gold_weight=gold,
        confidence=confidence,
        raw_line=original,
    )


# ---------------------------------------------------------------------------
# Geometry-based table reconstruction (the reliable path)
# ---------------------------------------------------------------------------
#
# A notebook page is a 3-column table: Village | Name | Amount. Tesseract's
# per-word bounding boxes (image_to_data) let us rebuild that table by geometry
# instead of trusting the recognized *text* — which matters because handwritten
# Tamil recognition is noisy, but word POSITIONS are stable. This gives us the
# correct ROW COUNT and a clean split of the (numeric) amount column even when
# some Tamil glyphs are misread. The user fixes the rest in the review screen.

_GOLD_ROW_HINTS = ("g", "gm", "gram", "grams", "coin", "கிராம்", "கிராம", "பவுன்", "sovereign")


def _group_words_into_rows(words: list[dict]) -> list[list[dict]]:
    """
    Group geometry words into visual rows.

    Each word dict must have: text, left, top, width, height, cx, cy, and
    optionally a `line_key` (engine-provided line id) and `conf`. When line_key
    is present it seeds the grouping; rows are then merged/split by vertical
    proximity so a single notebook line = one row regardless of engine.
    """
    if not words:
        return []

    # Decide whether the engine-provided line ids are actually useful. Some
    # engines (e.g. EasyOCR) return a single/constant line_key for every word,
    # in which case seeding by line_key would collapse the whole page into one
    # row. We only trust line_key when it produces more than one distinct group.
    distinct_line_keys = {w.get("line_key", 0) for w in words}
    heights = sorted(w["height"] for w in words if w["height"] > 0)
    median_h = heights[len(heights) // 2] if heights else 24
    # Two words belong to the same visual row when their vertical centres are
    # closer than ~70% of the median glyph height.
    threshold = max(10, median_h * 0.7)

    if len(distinct_line_keys) > 1:
        # Trust the engine's line grouping as a seed, then merge fragments.
        seeded: dict = {}
        for w in words:
            seeded.setdefault(w.get("line_key", 0), []).append(w)
        seed_groups = list(seeded.values())
    else:
        # No usable line ids: seed with one group per word and let the vertical
        # clustering below build the real rows purely from geometry.
        seed_groups = [[w] for w in words]

    for g in seed_groups:
        g.sort(key=lambda w: w["left"])
    seed_groups.sort(key=lambda g: sum(w["cy"] for w in g) / len(g))

    # Merge groups whose vertical centres are within the threshold. Because the
    # groups are sorted top-to-bottom, comparing against the current open row is
    # sufficient to cluster a full notebook line together.
    merged: list[list[dict]] = []
    for g in seed_groups:
        gcy = sum(w["cy"] for w in g) / len(g)
        if merged:
            prev = merged[-1]
            prev_cy = sum(w["cy"] for w in prev) / len(prev)
            if abs(gcy - prev_cy) <= threshold:
                prev.extend(g)
                prev.sort(key=lambda w: w["left"])
                continue
        merged.append(list(g))
    return merged


def _entries_from_words(words: list[dict], img_w: int) -> tuple[list[HandwrittenEntry], str]:
    """
    Reconstruct the notebook table from a list of geometry words.

    Shared by both the Tesseract and Google Vision engines. Each visual row is
    split into Village / Name / Amount by x-position:
      - amount  = numeric token on the far right
      - village = words in the left column
      - name    = the remaining middle words
    Returns (entries, raw_text).
    """
    line_groups = _group_words_into_rows(words)

    entries: list[HandwrittenEntry] = []
    raw_lines: list[str] = []

    for g in line_groups:
        row_text = " ".join(w["text"] for w in g).strip()
        if not row_text:
            continue

        # Skip page-number / header / total lines (very short, pure numbers, or
        # obvious totals) so they don't become bogus entries.
        letters = re.findall(r"[^\W\d_]", row_text, flags=re.UNICODE)
        digits = re.findall(r"\d", row_text)
        if not letters and len(digits) <= 1:
            # lone page number like "3" / "4"
            continue

        # --- Amount: rightmost numeric word(s) ---
        cash = 0.0
        gold = 0.0
        amount_word = None
        for w in reversed(g):
            if re.search(r"\d", w["text"]):
                amount_word = w
                break

        row_lower = row_text.lower()
        is_gold = any(h in row_lower for h in _GOLD_ROW_HINTS if len(h) > 1) or \
            bool(re.search(r"\b\d+\s*g\b", row_lower)) or "coin" in row_lower

        if amount_word is not None:
            val = _parse_amount_token(amount_word["text"])
            if val > 0:
                if is_gold:
                    gold = val
                else:
                    cash = val

        # --- Village / Name split by x-position of the non-amount words ---
        identity_words = [w for w in g if w is not amount_word and not re.fullmatch(r"[\d.,/-]+", w["text"])]
        village = None
        name = None
        if identity_words:
            # Column boundary: villages sit in the left ~35% of the writing area.
            xs = [w["left"] for w in identity_words]
            min_x = min(xs)
            span = max((w["left"] + w["width"]) for w in identity_words) - min_x
            boundary = min_x + max(span * 0.33, img_w * 0.10)

            village_tokens = [w["text"] for w in identity_words if w["cx"] <= boundary]
            name_tokens = [w["text"] for w in identity_words if w["cx"] > boundary]

            # If the split collapses (all one side), fall back to first=village.
            if not name_tokens and len(village_tokens) >= 2:
                village_tokens, name_tokens = village_tokens[:1], village_tokens[1:]
            elif not village_tokens and len(name_tokens) >= 2:
                village_tokens, name_tokens = name_tokens[:1], name_tokens[1:]

            village = " ".join(village_tokens).strip(" -–—") or None
            name = " ".join(name_tokens).strip(" -–—") or None

        has_amount = cash > 0 or gold > 0
        if not name and not village and not has_amount:
            continue

        # conf is 0-100 (Tesseract) or 0-1 (Vision, already scaled below).
        confs = [w.get("conf", 60.0) for w in g]
        avg_conf = (sum(confs) / len(confs)) / 100.0
        entries.append(HandwrittenEntry(
            name=name,
            village=village,
            cash_amount=cash,
            gold_weight=gold,
            confidence=round(max(0.2, min(0.95, avg_conf)), 2),
            raw_line=row_text,
        ))
        raw_lines.append(row_text)

    return entries, "\n".join(raw_lines)


def _extract_table_entries(processed_image) -> tuple[list[HandwrittenEntry], str]:
    """Tesseract engine: build geometry words via image_to_data, then reconstruct."""
    config = "--oem 1 --psm 6 -c preserve_interword_spaces=1"
    data = pytesseract.image_to_data(
        processed_image, lang="tam+eng", config=config,
        output_type=pytesseract.Output.DICT,
    )

    n = len(data.get("text", []))
    img_w = processed_image.size[0] if hasattr(processed_image, "size") else 1000

    words: list[dict] = []
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        try:
            conf = float(data["conf"][i])
        except (ValueError, TypeError):
            conf = -1.0
        if conf < 0:
            continue
        words.append({
            "text": txt,
            "left": data["left"][i],
            "top": data["top"][i],
            "width": data["width"][i],
            "height": data["height"][i],
            "cx": data["left"][i] + data["width"][i] / 2,
            "cy": data["top"][i] + data["height"][i] / 2,
            "conf": conf,
            "line_key": (data["block_num"][i], data["par_num"][i], data["line_num"][i]),
        })

    if not words:
        return [], ""
    return _entries_from_words(words, img_w)


async def _extract_table_via_vision(image_bytes: bytes) -> Optional[tuple[list[HandwrittenEntry], str]]:
    """
    Google Cloud Vision engine (primary for handwriting when a key is set).

    Calls images:annotate with DOCUMENT_TEXT_DETECTION, then converts the
    word-level bounding boxes from fullTextAnnotation into the same geometry
    word list the shared reconstruction uses.

    Returns None when Vision is not configured or the request fails, so the
    caller can fall back to Tesseract.
    """
    if not GOOGLE_VISION_API_KEY:
        return None

    try:
        import base64
        import httpx

        encoded = base64.b64encode(image_bytes).decode("ascii")
        payload = {
            "requests": [
                {
                    "image": {"content": encoded},
                    "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                    # Bias recognition toward Tamil + English.
                    "imageContext": {"languageHints": ["ta", "en"]},
                }
            ]
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                GOOGLE_VISION_ENDPOINT,
                params={"key": GOOGLE_VISION_API_KEY},
                json=payload,
            )

        if resp.status_code != 200:
            logger.warning("Vision API returned %s: %s", resp.status_code, resp.text[:300])
            return None

        data = resp.json()
        responses = data.get("responses") or []
        if not responses:
            return None
        annotation = responses[0].get("fullTextAnnotation")
        if not annotation:
            return [], ""

        words: list[dict] = []
        img_w = 1000
        for page in annotation.get("pages", []):
            page_w = page.get("width") or 0
            if page_w:
                img_w = max(img_w, page_w)
            for block in page.get("blocks", []):
                for paragraph in block.get("paragraphs", []):
                    for word in paragraph.get("words", []):
                        text = "".join(
                            sym.get("text", "") for sym in word.get("symbols", [])
                        ).strip()
                        if not text:
                            continue
                        verts = (word.get("boundingBox") or {}).get("vertices", [])
                        xs = [v.get("x", 0) for v in verts] or [0]
                        ys = [v.get("y", 0) for v in verts] or [0]
                        left, top = min(xs), min(ys)
                        width, height = max(xs) - left, max(ys) - top
                        conf = float(word.get("confidence", 0.6)) * 100.0
                        words.append({
                            "text": text,
                            "left": left,
                            "top": top,
                            "width": width if width > 0 else 1,
                            "height": height if height > 0 else 1,
                            "cx": left + (width or 1) / 2,
                            "cy": top + (height or 1) / 2,
                            "conf": conf,
                            # Vision has no line id; grouping falls back to
                            # vertical proximity via a single seed bucket.
                            "line_key": 0,
                        })

        if not words:
            return [], annotation.get("text", "")
        return _entries_from_words(words, img_w)

    except Exception:
        logger.exception("Google Vision OCR failed; will fall back to other engines.")
        return None


def _extract_table_via_easyocr(image_bytes: bytes) -> Optional[tuple[list[HandwrittenEntry], str]]:
    """
    EasyOCR engine (offline default). Returns geometry words fed into the shared
    table reconstruction. Returns None if EasyOCR is unavailable/disabled or on error.
    """
    if not (EASYOCR_AVAILABLE and EASYOCR_ENABLED):
        return None

    try:
        # Preprocess with Pillow (grayscale/upscale/sharpen) if available, then
        # hand EasyOCR a numpy array.
        if TESSERACT_AVAILABLE:  # Pillow imported alongside pytesseract
            pil = _preprocess_for_handwriting(PILImage.open(io.BytesIO(image_bytes)))
            img_arr = _np.array(pil)
            img_w = pil.size[0]
        else:
            from PIL import Image as _PILImage  # type: ignore
            pil = _PILImage.open(io.BytesIO(image_bytes)).convert("L")
            img_arr = _np.array(pil)
            img_w = pil.size[0]

        reader = _get_easyocr_reader()
        if reader is None:
            return None
        # detail=1 -> list of (bbox, text, confidence)
        results = reader.readtext(img_arr, detail=1, paragraph=False)

        words: list[dict] = []
        for bbox, text, conf in results:
            text = (text or "").strip()
            if not text:
                continue
            xs = [float(p[0]) for p in bbox]
            ys = [float(p[1]) for p in bbox]
            left, top = min(xs), min(ys)
            width, height = max(xs) - left, max(ys) - top
            words.append({
                "text": text,
                "left": left,
                "top": top,
                "width": width if width > 0 else 1,
                "height": height if height > 0 else 1,
                "cx": left + (width or 1) / 2,
                "cy": top + (height or 1) / 2,
                "conf": float(conf) * 100.0,
                "line_key": 0,  # no line ids; grouped by vertical proximity
            })

        if not words:
            return [], ""
        return _entries_from_words(words, int(img_w))

    except Exception:
        logger.exception("EasyOCR failed; will fall back to Tesseract.")
        return None


@router.post("/handwritten-entries", response_model=HandwrittenEntriesResponse)
async def process_handwritten_entries(file: UploadFile = File(...)):
    """
    Process a photo of a handwritten notebook page containing Tamil IN entries.

    Engine order:
      1. Google Cloud Vision DOCUMENT_TEXT_DETECTION (when GOOGLE_VISION_API_KEY
         is set) — best accuracy for handwritten Tamil; the recommended engine.
      2. EasyOCR (offline, pip-installed) — no system binary or cloud key
         required. NOTE: easyocr<=1.7.2 ships a broken Tamil recognizer, so it
         degrades to English-only recognition: it still recovers the numeric
         cash/gold amounts and English name initials and reconstructs all rows,
         but cannot read Tamil script. Use Vision for accurate Tamil.
      3. Tesseract (tam+eng) geometry table reconstruction — fallback.
      4. Tesseract line-by-line parsing — last resort.

    All engines feed the same word-geometry table reconstruction, so the number
    of extracted rows is driven by layout, not by which engine ran. Each
    detected row becomes an IN entry candidate (village / name / cash or gold).
    The client shows these in a review/edit screen before saving.
    """
    # We can serve the request if ANY engine is available.
    any_engine = bool(GOOGLE_VISION_API_KEY) or (EASYOCR_AVAILABLE and EASYOCR_ENABLED) or TESSERACT_AVAILABLE
    if not any_engine:
        logger.error("Handwritten OCR requested but no OCR engine is available.")
        return HandwrittenEntriesResponse(
            raw_text="No OCR engine available (install easyocr, or set GOOGLE_VISION_API_KEY, or install Tesseract).",
            entries=[],
            count=0,
        )

    try:
        contents = await file.read()

        entries: list[HandwrittenEntry] = []
        raw_text = ""

        # --- Engine 1: Google Cloud Vision (best for handwriting, if key set) ---
        if GOOGLE_VISION_API_KEY:
            vision = await _extract_table_via_vision(contents)
            if vision is not None:
                entries, raw_text = vision
                if entries:
                    logger.info("Vision OCR extracted %d entries.", len(entries))
                    return HandwrittenEntriesResponse(
                        raw_text=raw_text, entries=entries, count=len(entries),
                    )

        # --- Engine 2: EasyOCR (offline default, bundles Tamil model) ---
        if not entries and EASYOCR_AVAILABLE and EASYOCR_ENABLED:
            easy = _extract_table_via_easyocr(contents)
            if easy is not None:
                entries, raw_text = easy
                if entries:
                    logger.info("EasyOCR extracted %d entries.", len(entries))
                    return HandwrittenEntriesResponse(
                        raw_text=raw_text, entries=entries, count=len(entries),
                    )

        # --- Engine 3: Tesseract geometry, then line-parse fallback ---
        if not entries and TESSERACT_AVAILABLE:
            image = PILImage.open(io.BytesIO(contents))
            processed = _preprocess_for_handwriting(image)

            try:
                entries, raw_text = _extract_table_entries(processed)
            except Exception:
                logger.exception("Geometry-based table extraction failed; falling back.")

            if not entries:
                config = "--oem 1 --psm 6 -c preserve_interword_spaces=1"
                raw_text = pytesseract.image_to_string(
                    processed, lang="tam+eng", config=config
                )
                if not raw_text.strip():
                    raw_text = pytesseract.image_to_string(processed, lang="tam+eng")

                for line in raw_text.splitlines():
                    parsed = _parse_handwritten_line(line)
                    if parsed is not None:
                        entries.append(parsed)

        logger.info("Handwritten OCR extracted %d entries.", len(entries))
        return HandwrittenEntriesResponse(
            raw_text=raw_text,
            entries=entries,
            count=len(entries),
        )

    except Exception:
        logger.exception("Handwritten OCR processing failed.")
        return HandwrittenEntriesResponse(
            raw_text="OCR processing failed. Please try again.",
            entries=[],
            count=0,
        )
