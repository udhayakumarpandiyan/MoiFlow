"""
OCR endpoint — processes invitation images and extracts event details.

Uses Tesseract (pytesseract + Pillow) with Tamil + English language packs.
Falls back gracefully when Tesseract is not installed.
"""

import io
import logging
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
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    logger.warning(
        "pytesseract or Pillow not installed — OCR endpoint will return empty results. "
        "Install with: pip install pytesseract Pillow"
    )


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
