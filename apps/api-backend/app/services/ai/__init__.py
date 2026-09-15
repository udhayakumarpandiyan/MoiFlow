"""
AI service layer.

A provider-agnostic AI service used by the API layer. The concrete provider
(Sarvam today) is chosen by config and hidden behind the AIProvider interface,
so swapping providers later touches only this package.
"""

from app.services.ai.service import AIService, get_ai_service

__all__ = ["AIService", "get_ai_service"]
