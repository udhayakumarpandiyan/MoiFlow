"""
NLU parser for Tamil/English voice entry text.

Extracts direction, cash amount, and gold weight.
"""

import re
import logging

logger = logging.getLogger(__name__)


IN_WORDS = [
    "கொடுத்தார்",
    "கொடுத்தார்கள்",
    "தந்தார்",
    "வந்தது",
    "பெற்றேன்",
    "பெற்றது",
    "கிடைத்தது",
]

OUT_WORDS = [
    "கொடுத்தேன்",
    "கொடுத்த",
    "கொடுக்க",
    "தந்தேன்",
    "வழங்கினேன்",
    "செலவு",
]


def parse_command(text: str) -> dict:
    """
    Parse Tamil/English voice text to extract entry details.

    Returns:
        personName, direction, cashAmount, goldWeight, confidence
    """
    direction = None

    # OUT check first (more specific keywords win)
    if any(word in text for word in OUT_WORDS):
        direction = "OUT"
    elif any(word in text for word in IN_WORDS):
        direction = "IN"

    # Cash amount
    cash: float = 0.0
    cash_match = re.search(
        r"(\d+(?:\.\d+)?)\s*(?:ரூபாய்|ரூ\.?|rs\.?|rupees?)",
        text,
        re.IGNORECASE,
    )
    if cash_match:
        cash = float(cash_match.group(1))

    # Gold weight in grams
    gold: float = 0.0
    gold_match = re.search(
        r"(\d+(?:\.\d+)?)\s*(?:கிராம்|கிராம|gram[s]?|g(?:\s|$))",
        text,
        re.IGNORECASE,
    )
    if gold_match:
        gold = float(gold_match.group(1))

    has_amount = cash > 0 or gold > 0
    confidence = 0.9 if (direction and has_amount) else (0.6 if direction else 0.3)

    return {
        "personName": None,
        "direction": direction,
        "cashAmount": cash,
        "goldWeight": gold,
        "confidence": confidence,
    }
