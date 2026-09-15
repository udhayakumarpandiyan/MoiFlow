"""
AI provider abstraction.

`AIProvider` is the replaceable seam: it exposes a single `complete()` that
takes a system + user prompt and returns text. Higher-level tasks (extraction,
summaries, suggestions) are built on top of this in service.py, so adding a new
provider only requires implementing this one method.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class AIResult:
    """Result of a provider completion, with lightweight usage metadata."""

    text: str
    provider: str
    latency_ms: int
    success: bool
    tokens_in: int = 0
    tokens_out: int = 0


class AIProvider(ABC):
    """Replaceable AI backend."""

    name: str = "base"

    @property
    @abstractmethod
    def available(self) -> bool:
        """Whether this provider is configured and usable."""
        raise NotImplementedError

    @abstractmethod
    async def complete(
        self, system_prompt: str, user_prompt: str, temperature: float = 0.2
    ) -> AIResult:
        """Run a single completion. Must not raise for provider errors —
        returns AIResult(success=False) instead so callers degrade gracefully."""
        raise NotImplementedError


class NoneProvider(AIProvider):
    """Disabled provider — used when AI_PROVIDER=none or no key configured."""

    name = "none"

    @property
    def available(self) -> bool:
        return False

    async def complete(
        self, system_prompt: str, user_prompt: str, temperature: float = 0.2
    ) -> AIResult:
        return AIResult(
            text="", provider=self.name, latency_ms=0, success=False
        )


class SarvamProvider(AIProvider):
    """Sarvam AI provider backed by the isolated integration client."""

    name = "sarvam"

    def __init__(self) -> None:
        # Imported lazily so the integration isn't required when AI is disabled.
        from app.integrations.sarvam import SarvamClient

        self._client = SarvamClient()

    @property
    def available(self) -> bool:
        return self._client.configured

    async def complete(
        self, system_prompt: str, user_prompt: str, temperature: float = 0.2
    ) -> AIResult:
        started = time.perf_counter()
        try:
            text = await self._client.chat(system_prompt, user_prompt, temperature)
            latency = int((time.perf_counter() - started) * 1000)
            # Rough token estimate (provider does not always return usage).
            tokens_in = max(1, len(system_prompt + user_prompt) // 4)
            tokens_out = max(1, len(text) // 4)
            return AIResult(
                text=text,
                provider=self.name,
                latency_ms=latency,
                success=True,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
            )
        except Exception:
            latency = int((time.perf_counter() - started) * 1000)
            return AIResult(
                text="", provider=self.name, latency_ms=latency, success=False
            )


def build_provider() -> AIProvider:
    """Instantiate the configured AI provider."""
    from app.core.config import AI_PROVIDER

    if AI_PROVIDER == "sarvam":
        return SarvamProvider()
    return NoneProvider()
