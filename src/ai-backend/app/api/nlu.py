from fastapi import APIRouter

from app.schemas.voice_entry import (
    NLURequest,
    VoiceEntryResult,
)
from app.schemas.voice_event import (
    NLUEventRequest,
    ParsedVoiceEvent,
)

from app.nlu.parser import parse_command
from app.nlu.event_parser import parse_event


router = APIRouter()


@router.post(
    "/parse",
    response_model=VoiceEntryResult,
)
def parse_voice(
    request: NLURequest,
):
    return parse_command(
        request.text
    )


@router.post(
    "/parse-event",
    response_model=ParsedVoiceEvent,
)
def parse_voice_event(
    request: NLUEventRequest,
):
    return parse_event(
        request.text
    )