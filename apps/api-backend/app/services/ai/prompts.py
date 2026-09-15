"""
Prompt templates for AI tasks.

Kept separate from the service so wording can be tuned without touching logic.
All extraction prompts instruct the model to reply with STRICT JSON so the
service can parse deterministically.
"""

# --- Extraction (structured output) ----------------------------------------

MOI_ENTRY_SYSTEM = (
    "You extract structured Moi (gift) entry data from Tamil or English text. "
    "Moi is a South Indian tradition of recording monetary/gold gifts at events. "
    "Reply with STRICT JSON only, no prose, matching this shape: "
    '{"personName": string|null, "direction": "IN"|"OUT"|null, '
    '"cashAmount": number, "goldWeight": number, "villageName": string|null, '
    '"confidence": number}. '
    "direction is IN when the user RECEIVED a gift, OUT when they GAVE one. "
    "cashAmount is rupees, goldWeight is grams; use 0 when absent."
)

FINANCE_TXN_SYSTEM = (
    "You extract structured personal-finance transaction data from Tamil or "
    "English text. Reply with STRICT JSON only, matching this shape: "
    '{"kind": "CREDIT"|"LOAN"|"BUSINESS"|null, '
    '"direction": "IN"|"OUT"|null, "amount": number, '
    '"party": string|null, "interestRate": number, "note": string|null, '
    '"confidence": number}. amount is rupees; use 0 when absent.'
)

TEXT_UNDERSTAND_SYSTEM = (
    "You interpret a user's Tamil or English request about their Moi/finance "
    "records and return STRICT JSON: "
    '{"intent": string, "entities": object, "confidence": number}.'
)

# --- Generative (natural language output) ----------------------------------

SUMMARY_SYSTEM = (
    "You are a concise financial assistant for a Tamil user. Given structured "
    "totals, write a short, plain summary (3-5 sentences). If the user's "
    "language is Tamil, reply in Tamil; otherwise English. No markdown."
)

GROWTH_SYSTEM = (
    "You analyze period-over-period financial figures and explain growth or "
    "downfall. Return STRICT JSON: "
    '{"trend": "growth"|"downfall"|"flat", "changePct": number, '
    '"summary": string, "drivers": [string]}. '
    "summary in the user's language (Tamil if input is Tamil)."
)

SUGGESTIONS_SYSTEM = (
    "You give practical, non-judgmental money suggestions for a Tamil user "
    "based on their finance summary. Return STRICT JSON: "
    '{"suggestions": [string]} with 3-5 short, actionable items in the user\'s '
    "language."
)
