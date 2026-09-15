"""Pydantic schemas for AI endpoints."""

from typing import Any, Optional

from pydantic import BaseModel, Field


class TextRequest(BaseModel):
    """A free-text request (Tamil or English) for extraction/understanding."""

    text: str = Field(..., min_length=1, max_length=2000)


class ExtractionResponse(BaseModel):
    available: bool
    parsed: Optional[dict[str, Any]] = None


class UnderstandResponse(BaseModel):
    available: bool
    parsed: Optional[dict[str, Any]] = None


class ContextRequest(BaseModel):
    """Structured figures the AI reasons over (never raw PII)."""

    context: dict[str, Any] = Field(default_factory=dict)
    domain: str = Field(default="finance")


class SummaryResponse(BaseModel):
    available: bool
    summary: Optional[str] = None


class GrowthResponse(BaseModel):
    available: bool
    analysis: Optional[dict[str, Any]] = None


class SuggestionsResponse(BaseModel):
    available: bool
    suggestions: list[str] = Field(default_factory=list)
