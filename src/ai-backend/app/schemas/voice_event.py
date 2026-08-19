from typing import Optional

from pydantic import BaseModel


class NLUEventRequest(BaseModel):
    text: str


class ParsedVoiceEvent(BaseModel):
    eventName: Optional[str] = None
    eventType: Optional[str] = None
    date: Optional[str] = None
    venue: Optional[str] = None
    confidence: float = 0
