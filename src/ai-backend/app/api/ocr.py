import re
from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel


router = APIRouter()


class OCRResponse(BaseModel):
    raw_text: str
    event_name: str | None = None
    date: str | None = None
    venue: str | None = None
    confidence: float = 0.0


# Tamil event type keywords
EVENT_TYPE_KEYWORDS = [
    "திருமணம்",
    "காதணி",
    "பிறந்தநாள்",
    "முப்பூசை",
    "புதுமனை",
    "கருமகாரியம்",
    "மஞ்சள் நீராட்டு",
]

# Tamil month mapping
TAMIL_MONTHS = [
    ("ஜனவரி", "01"),
    ("பிப்ரவரி", "02"),
    ("மார்ச்", "03"),
    ("ஏப்ரல்", "04"),
    ("மே", "05"),
    ("ஜூன்", "06"),
    ("ஜூலை", "07"),
    ("ஆகஸ்ட்", "08"),
    ("செப்டம்பர்", "09"),
    ("அக்டோபர்", "10"),
    ("நவம்பர்", "11"),
    ("டிசம்பர்", "12"),
]

# Venue indicators
VENUE_INDICATORS = ["ஹால்", "மண்டபம்", "இடம்"]


def extract_event_name(text: str) -> str | None:
    normalized = text.lower()
    for keyword in EVENT_TYPE_KEYWORDS:
        if keyword in normalized:
            return keyword
    return None


def extract_date(text: str) -> str | None:
    # Try numeric DD-MM-YYYY or DD/MM/YYYY
    match = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", text)
    if match:
        day = match.group(1).zfill(2)
        month = match.group(2).zfill(2)
        year = match.group(3)
        return f"{year}-{month}-{day}"

    # Try Tamil month names
    for tamil_month, month_num in TAMIL_MONTHS:
        pattern = rf"(\d{{1,2}})\s*{tamil_month}(?:\s*(\d{{4}}))?"
        match = re.search(pattern, text)
        if match:
            day = match.group(1).zfill(2)
            year = match.group(2) or "2025"
            return f"{year}-{month_num}-{day}"

    return None


def extract_venue(text: str) -> str | None:
    for indicator in VENUE_INDICATORS:
        idx = text.find(indicator)
        if idx != -1:
            after = text[idx + len(indicator):].strip()
            clause = re.match(r"^[^,.\n]+", after)
            venue = clause.group(0).strip() if clause else after.split("\n")[0].strip()
            if venue:
                return f"{indicator} {venue}"
    return None


def compute_confidence(
    event_name: str | None, date: str | None, venue: str | None
) -> float:
    fields = sum(1 for f in [event_name, date, venue] if f is not None)
    if fields >= 2:
        return 0.8
    if fields == 1:
        return 0.5
    return 0.2


try:
    import pytesseract
    from PIL import Image as PILImage
    import io

    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False


@router.post("/process", response_model=OCRResponse)
async def process_image(file: UploadFile = File(...)):
    """
    Process an invitation image and extract event details.
    Uses Tesseract OCR for text extraction, then regex-based parsing
    for Tamil event keywords, dates, and venue.
    """
    if not TESSERACT_AVAILABLE:
        return OCRResponse(
            raw_text="OCR backend dependencies not installed (pytesseract, Pillow).",
            confidence=0.0,
        )

    try:
        contents = await file.read()
        image = PILImage.open(io.BytesIO(contents))

        # Run OCR with Tamil + English
        raw_text = pytesseract.image_to_string(image, lang="tam+eng")

        if not raw_text.strip():
            return OCRResponse(
                raw_text="No text detected in image.",
                confidence=0.1,
            )

        event_name = extract_event_name(raw_text)
        date = extract_date(raw_text)
        venue = extract_venue(raw_text)
        confidence = compute_confidence(event_name, date, venue)

        return OCRResponse(
            raw_text=raw_text,
            event_name=event_name,
            date=date,
            venue=venue,
            confidence=confidence,
        )
    except Exception as e:
        return OCRResponse(
            raw_text=f"OCR processing failed: {str(e)}",
            confidence=0.0,
        )
