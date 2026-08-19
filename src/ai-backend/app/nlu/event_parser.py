import re
from typing import Optional


# Tamil keywords for event types
WEDDING_WORDS = ["திருமணம்", "கல்யாணம்", "மணம்", "wedding"]
FUNERAL_WORDS = ["இறப்பு", "சாவு", "காரியம்", "funeral"]
BIRTHDAY_WORDS = ["பிறந்தநாள்", "birthday"]
HOUSEWARMING_WORDS = ["கிரகப்பிரவேசம்", "வீடு புகுவிழா", "housewarming"]
CEREMONY_WORDS = ["விழா", "நிகழ்ச்சி", "function", "ceremony"]


def parse_event(text: str) -> dict:
    """
    Parse Tamil/English voice text to extract event details.
    Returns structured event data with confidence score.
    """
    event_type: Optional[str] = None
    event_name: Optional[str] = None

    # Detect event type
    if any(w in text for w in WEDDING_WORDS):
        event_type = "wedding"
        event_name = "திருமணம்"
    elif any(w in text for w in FUNERAL_WORDS):
        event_type = "funeral"
        event_name = "இறப்பு"
    elif any(w in text for w in BIRTHDAY_WORDS):
        event_type = "birthday"
        event_name = "பிறந்தநாள்"
    elif any(w in text for w in HOUSEWARMING_WORDS):
        event_type = "housewarming"
        event_name = "கிரகப்பிரவேசம்"
    elif any(w in text for w in CEREMONY_WORDS):
        event_type = "ceremony"
        event_name = "விழா"

    # Extract date patterns (DD/MM/YYYY or DD-MM-YYYY)
    date: Optional[str] = None
    date_match = re.search(
        r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})",
        text,
    )
    if date_match:
        day, month, year = date_match.groups()
        if len(year) == 2:
            year = f"20{year}"
        date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

    # Extract venue/location — look for text after location keywords
    venue: Optional[str] = None
    venue_match = re.search(
        r"(?:இடம்|place|venue|hall|மண்டபம்|at)\s*[:\-]?\s*(.+?)(?:\s*(?:date|நாள்|on|\d)|$)",
        text,
        re.IGNORECASE,
    )
    if venue_match:
        venue = venue_match.group(1).strip()
        if len(venue) > 100:
            venue = venue[:100]

    # Confidence scoring
    has_type = event_type is not None
    has_date = date is not None
    has_venue = venue is not None

    if has_type and has_date and has_venue:
        confidence = 0.95
    elif has_type and (has_date or has_venue):
        confidence = 0.8
    elif has_type:
        confidence = 0.6
    else:
        confidence = 0.3

    result = {
        "eventName": event_name,
        "eventType": event_type,
        "date": date,
        "venue": venue,
        "confidence": confidence,
    }
    print(f"[NLU-Event] parsed: {result}")
    return result
