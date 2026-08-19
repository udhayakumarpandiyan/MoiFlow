from typing import Optional, Literal

from pydantic import BaseModel


class NLURequest(BaseModel):
    text: str


class VoiceEntryResult(BaseModel):
    personName: Optional[str] = None

    direction: Optional[
        Literal["IN", "OUT"]
    ] = None

    cashAmount: float = 0

    goldWeight: float = 0

    confidence: float = 0