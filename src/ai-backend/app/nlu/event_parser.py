"""
NLU event parser for Tamil/English voice text.

Extracts event type, event name, date, time, venue, and village.
Event type constants match the mobile app's AddEditEventModal types.
"""

import re
import logging
from datetime import date as date_cls
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Event type keywords → canonical constants (must match mobile app)
# ---------------------------------------------------------------------------

EVENT_TYPE_MAP: list[tuple[list[str], str]] = [
    (["திருமணம்", "கல்யாணம்", "மணம்", "wedding", "marriage"], "WEDDING"),
    (["காதணி", "ear piercing", "ear-piercing"], "EAR_PIERCING"),
    (["பிறந்தநாள்", "birthday"], "BIRTHDAY"),
    (["முப்பூசை", "muppoosai"], "MUPPOOSAI_PADAYAL"),
    (["புதுமனை", "கிரகப்பிரவேசம்", "வீடு புகுவிழா", "housewarming", "gruhapravesam"], "HOUSEWARMING"),
    (["கருமகாரியம்", "இறப்பு", "சாவு", "காரியம்", "funeral", "death"], "DEATH"),
    (["மஞ்சள் நீராட்டு", "manjal neerattu"], "MANJAL_NEERATTU"),
    (["விழா", "நிகழ்ச்சி", "function", "ceremony"], "OTHER"),
]

# ---------------------------------------------------------------------------
# Tamil month → zero-padded month number
# ---------------------------------------------------------------------------

TAMIL_MONTHS: list[tuple[str, str]] = [
    ("ஜனவரி", "01"), ("பிப்ரவரி", "02"), ("மார்ச்", "03"),
    ("ஏப்ரல்", "04"), ("மே", "05"), ("ஜூன்", "06"),
    ("ஜூலை", "07"), ("ஆகஸ்ட்", "08"), ("செப்டம்பர்", "09"),
    ("அக்டோபர்", "10"), ("நவம்பர்", "11"), ("டிசம்பர்", "12"),
]

ENGLISH_MONTHS: list[tuple[str, str]] = [
    ("january", "01"), ("february", "02"), ("march", "03"),
    ("april", "04"), ("may", "05"), ("june", "06"),
    ("july", "07"), ("august", "08"), ("september", "09"),
    ("october", "10"), ("november", "11"), ("december", "12"),
    ("jan", "01"), ("feb", "02"), ("mar", "03"),
    ("apr", "04"), ("jun", "06"), ("jul", "07"),
    ("aug", "08"), ("sep", "09"), ("oct", "10"),
    ("nov", "11"), ("dec", "12"),
]

# ---------------------------------------------------------------------------
# Venue and village keywords
# ---------------------------------------------------------------------------

VENUE_KEYWORDS = ["இடம்", "ஹால்", "மண்டபம்", "hall", "mandapam", "mahal", "kalyana mandapam"]
VILLAGE_KEYWORDS = ["ஊர்", "ஊரு", "கிராமம்", "village"]


# ---------------------------------------------------------------------------
# Extraction helpers
# ---------------------------------------------------------------------------

def _extract_event_type(text: str) -> Optional[str]:
    lower = text.lower()
    for keywords, event_type in EVENT_TYPE_MAP:
        if any(kw in lower for kw in keywords):
            return event_type
    return None


def _extract_date(text: str) -> Optional[str]:
    current_year = str(date_cls.today().year)

    # DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    m = re.search(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})", text)
    if m:
        day, month, year = m.group(1).zfill(2), m.group(2).zfill(2), m.group(3)
        if len(year) == 2:
            year = f"20{year}"
        return f"{year}-{month}-{day}"

    # YYYY-MM-DD
    m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", text)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"

    # Tamil month: "12 ஜூலை 2025" or "12 ஜூலை"
    for tamil_month, month_num in TAMIL_MONTHS:
        m = re.search(rf"(\d{{1,2}})\s*{tamil_month}(?:\s*(\d{{4}}))?", text)
        if m:
            day = m.group(1).zfill(2)
            year = m.group(2) or current_year
            return f"{year}-{month_num}-{day}"

    # English month: "12 July 2025", "July 12 2025", "12th July"
    lower = text.lower()
    for eng_month, month_num in ENGLISH_MONTHS:
        m = re.search(
            rf"(\d{{1,2}})(?:st|nd|rd|th)?\s+{eng_month}(?:\s+(\d{{4}}))?",
            lower,
        )
        if m:
            day = m.group(1).zfill(2)
            year = m.group(2) or current_year
            return f"{year}-{month_num}-{day}"
        m = re.search(
            rf"{eng_month}\s+(\d{{1,2}})(?:st|nd|rd|th)?[,\s]+(\d{{4}})?",
            lower,
        )
        if m:
            day = m.group(1).zfill(2)
            year = m.group(2) or current_year
            return f"{year}-{month_num}-{day}"

    # Relative: tomorrow / அடுத்த வாரம்
    if "நாளை" in text:
        from datetime import timedelta
        tomorrow = date_cls.today() + timedelta(days=1)
        return tomorrow.isoformat()

    return None


def _extract_time(text: str) -> Optional[str]:
    lower = text.lower()

    # HH:MM or HH.MM with optional am/pm
    m = re.search(r"(\d{1,2})[:.]\s*(\d{2})\s*(am|pm)?", lower)
    if m:
        h, mins, ampm = int(m.group(1)), m.group(2), m.group(3)
        if ampm == "pm" and h < 12:
            h += 12
        elif ampm == "am" and h == 12:
            h = 0
        return f"{h:02d}:{mins}"

    # "மாலை 5 மணி" (evening)
    m = re.search(r"மாலை\s*(\d{1,2})", text)
    if m:
        h = int(m.group(1))
        return f"{(h + 12) % 24:02d}:00"

    # "இரவு 8 மணி" (night)
    m = re.search(r"இரவு\s*(\d{1,2})", text)
    if m:
        h = int(m.group(1))
        return f"{(h + 12) % 24:02d}:00"

    # "காலை 10 மணி" (morning)
    m = re.search(r"காலை\s*(\d{1,2})", text)
    if m:
        return f"{int(m.group(1)):02d}:00"

    # "10 மணி" generic
    m = re.search(r"(\d{1,2})\s*மணி", text)
    if m:
        return f"{int(m.group(1)):02d}:00"

    # English "5 pm" / "10 am"
    m = re.search(r"(\d{1,2})\s*(am|pm)", lower)
    if m:
        h, ampm = int(m.group(1)), m.group(2)
        if ampm == "pm" and h < 12:
            h += 12
        elif ampm == "am" and h == 12:
            h = 0
        return f"{h:02d}:00"

    return None


def _extract_venue(text: str) -> Optional[str]:
    lower = text.lower()
    for kw in VENUE_KEYWORDS:
        idx = lower.find(kw.lower())
        if idx != -1:
            after = text[idx + len(kw):].strip()
            m = re.match(r"^[^,.\n]+", after)
            venue = m.group(0).strip() if m else after.split("\n")[0].strip()
            if venue:
                return venue
    # "venue: ..." / "place: ..."
    m = re.search(r"(?:venue|place|location)\s*[:\-]\s*(.+)", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None


def _extract_village(text: str) -> Optional[str]:
    lower = text.lower()
    for kw in VILLAGE_KEYWORDS:
        idx = lower.find(kw.lower())
        if idx != -1:
            # Text after keyword
            after = text[idx + len(kw):].strip()
            m = re.match(r"^[^,.\n]+", after)
            village = m.group(0).strip() if m else after.split()[0].strip() if after else None
            if village and len(village) > 1:
                return village
            # Text before keyword (e.g., "முத்தரசன்குப்பம் ஊர்")
            before = text[:idx].strip()
            last = before.split()[-1].strip() if before.split() else None
            if last and len(last) > 2:
                return last
    return None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def parse_event(text: str) -> dict:
    """
    Parse Tamil/English voice text to extract event details.

    Returns a dict matching the ParsedVoiceEvent schema.
    """
    event_type = _extract_event_type(text)
    date = _extract_date(text)
    time = _extract_time(text)
    venue = _extract_venue(text)
    village_name = _extract_village(text)

    # Build a human-readable event name from the type
    event_name: Optional[str] = None
    if event_type:
        type_to_name = {
            "WEDDING": "திருமணம்",
            "EAR_PIERCING": "காதணி",
            "BIRTHDAY": "பிறந்தநாள்",
            "MUPPOOSAI_PADAYAL": "முப்பூசை",
            "HOUSEWARMING": "புதுமனை",
            "DEATH": "கருமகாரியம்",
            "MANJAL_NEERATTU": "மஞ்சள் நீராட்டு",
            "OTHER": "விழா",
        }
        event_name = type_to_name.get(event_type)

    # Confidence
    has_type = event_type is not None
    has_date = date is not None
    has_venue = venue is not None
    if has_type and has_date and has_venue:
        confidence = 0.95
    elif has_type and (has_date or has_venue):
        confidence = 0.80
    elif has_type:
        confidence = 0.60
    else:
        confidence = 0.30

    return {
        "eventName": event_name,
        "eventType": event_type,
        "date": date,
        "time": time,
        "venue": venue,
        "villageName": village_name,
        "confidence": confidence,
    }
