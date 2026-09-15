"""
AI service.

Provider-agnostic AI operations for the app. Each method builds a prompt, runs
it through the configured AIProvider, parses the result, and (when a DB session
is provided) logs an ai_usage row. Every method degrades gracefully: if AI is
unavailable it returns a typed "unavailable" result rather than raising.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.ai_usage import AIUsage
from app.services.ai import prompts
from app.services.ai.provider import AIProvider, AIResult, build_provider

logger = logging.getLogger(__name__)


def _extract_json(text: str) -> Optional[dict]:
    """Best-effort parse of a JSON object from a model response."""
    text = text.strip()
    # Strip ```json fences if present.
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fall back to the first {...} block.
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if brace:
            try:
                return json.loads(brace.group(0))
            except json.JSONDecodeError:
                return None
    return None


class AIService:
    def __init__(self, provider: AIProvider) -> None:
        self._provider = provider

    @property
    def available(self) -> bool:
        return self._provider.available

    # -- Logging ----------------------------------------------------------

    async def _log(
        self,
        db: Optional[AsyncSession],
        *,
        task: str,
        domain: Optional[str],
        result: AIResult,
        user_id: Optional[uuid.UUID],
    ) -> None:
        if db is None:
            return
        try:
            db.add(
                AIUsage(
                    user_id=user_id,
                    provider=result.provider,
                    task=task,
                    domain=domain,
                    tokens_in=result.tokens_in,
                    tokens_out=result.tokens_out,
                    latency_ms=result.latency_ms,
                    success=result.success,
                )
            )
            await db.flush()
        except Exception:  # pragma: no cover — logging must never break a request
            logger.exception("Failed to record ai_usage")

    # -- Extraction tasks -------------------------------------------------

    async def extract_moi_entry(
        self, text: str, db=None, user_id=None
    ) -> dict[str, Any]:
        result = await self._provider.complete(prompts.MOI_ENTRY_SYSTEM, text)
        await self._log(db, task="moi_extract", domain="moi", result=result, user_id=user_id)
        data = _extract_json(result.text) if result.success else None
        if not data:
            return {"available": self.available, "parsed": None}
        return {"available": True, "parsed": data}

    async def extract_finance_txn(
        self, text: str, db=None, user_id=None
    ) -> dict[str, Any]:
        result = await self._provider.complete(prompts.FINANCE_TXN_SYSTEM, text)
        await self._log(db, task="finance_extract", domain="finance", result=result, user_id=user_id)
        data = _extract_json(result.text) if result.success else None
        if not data:
            return {"available": self.available, "parsed": None}
        return {"available": True, "parsed": data}

    async def understand_text(
        self, text: str, db=None, user_id=None
    ) -> dict[str, Any]:
        result = await self._provider.complete(prompts.TEXT_UNDERSTAND_SYSTEM, text)
        await self._log(db, task="text_understand", domain="common", result=result, user_id=user_id)
        data = _extract_json(result.text) if result.success else None
        if not data:
            return {"available": self.available, "parsed": None}
        return {"available": True, "parsed": data}

    # -- Generative tasks -------------------------------------------------

    async def summarize(
        self, context_json: dict, domain: str = "finance", db=None, user_id=None
    ) -> dict[str, Any]:
        prompt = "Summarize these figures:\n" + json.dumps(
            context_json, ensure_ascii=False
        )
        result = await self._provider.complete(prompts.SUMMARY_SYSTEM, prompt, 0.4)
        await self._log(db, task="summary", domain=domain, result=result, user_id=user_id)
        if not result.success:
            return {"available": self.available, "summary": None}
        return {"available": True, "summary": result.text.strip()}

    async def analyze_growth(
        self, context_json: dict, domain: str = "finance", db=None, user_id=None
    ) -> dict[str, Any]:
        prompt = "Analyze growth/downfall:\n" + json.dumps(
            context_json, ensure_ascii=False
        )
        result = await self._provider.complete(prompts.GROWTH_SYSTEM, prompt, 0.3)
        await self._log(db, task="growth", domain=domain, result=result, user_id=user_id)
        data = _extract_json(result.text) if result.success else None
        if not data:
            return {"available": self.available, "analysis": None}
        return {"available": True, "analysis": data}

    async def suggest(
        self, context_json: dict, domain: str = "finance", db=None, user_id=None
    ) -> dict[str, Any]:
        prompt = "Give money suggestions based on:\n" + json.dumps(
            context_json, ensure_ascii=False
        )
        result = await self._provider.complete(prompts.SUGGESTIONS_SYSTEM, prompt, 0.5)
        await self._log(db, task="suggestion", domain=domain, result=result, user_id=user_id)
        data = _extract_json(result.text) if result.success else None
        suggestions = (data or {}).get("suggestions") if data else None
        if not suggestions:
            return {"available": self.available, "suggestions": []}
        return {"available": True, "suggestions": suggestions}


# Module-level singleton (provider is cheap; client is lazy inside it).
_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    global _service
    if _service is None:
        _service = AIService(build_provider())
    return _service
