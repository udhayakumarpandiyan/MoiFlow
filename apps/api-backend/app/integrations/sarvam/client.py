"""
Sarvam AI HTTP client.

Thin async wrapper over Sarvam's chat-completions API. The API key is a
backend-only secret (app.core.config.SARVAM_API_KEY). This client only knows
how to talk to Sarvam; higher-level AI orchestration (prompts per task,
extraction, summaries) lives in app/services/ai so the provider stays
replaceable.
"""

import logging

import httpx

from app.core.config import SARVAM_API_KEY, SARVAM_BASE_URL, SARVAM_CHAT_MODEL

logger = logging.getLogger(__name__)

_TIMEOUT = 30.0


class SarvamClient:
    """Async client for Sarvam chat completions."""

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self._api_key = api_key or SARVAM_API_KEY
        self._base_url = (base_url or SARVAM_BASE_URL).rstrip("/")
        self._model = SARVAM_CHAT_MODEL

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def chat(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> str:
        """
        Send a system+user prompt and return the assistant text.

        Raises RuntimeError if not configured or on provider error.
        """
        if not self._api_key:
            raise RuntimeError("Sarvam API key is not configured.")

        url = f"{self._base_url}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
        }

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, json=body)

        if resp.status_code != 200:
            logger.error("Sarvam HTTP %s: %s", resp.status_code, resp.text[:300])
            raise RuntimeError(f"Sarvam returned HTTP {resp.status_code}.")

        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError("Unexpected Sarvam response shape.") from exc
