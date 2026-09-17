"""
2Factor SMS OTP client.

We generate/own the OTP lifecycle (rate limit, attempts, expiry) in our
backend and use 2Factor purely as the delivery channel. 2Factor's SMS OTP
endpoint accepts a caller-supplied OTP value:

    GET https://2factor.in/API/V1/{api_key}/SMS/{phone}/{otp}/{template_name}

A successful response has JSON `{"Status": "Success", "Details": "..."}`.

The API key is a backend-only secret (app.core.config.TWOFACTOR_API_KEY) and
is never exposed to the mobile app — the app only talks to our backend.
"""

import logging

import httpx

from app.core.config import (
    TWOFACTOR_API_KEY,
    TWOFACTOR_TEMPLATE_NAME,
)

logger = logging.getLogger(__name__)

_BASE_URL = "https://2factor.in/API/V1"
_TIMEOUT = 10.0


class TwoFactorClient:
    """Thin async client around the 2Factor SMS OTP API."""

    def __init__(self, api_key: str | None = None, template_name: str | None = None):
        self._api_key = api_key or TWOFACTOR_API_KEY
        self._template_name = (
            template_name if template_name is not None else TWOFACTOR_TEMPLATE_NAME
        )

    async def send_otp(self, phone: str, otp: str) -> tuple[bool, str]:
        """
        Deliver `otp` to `phone` (10-digit Indian number) via 2Factor.

        Returns (success, message). Never raises for provider/network errors —
        returns (False, reason) so the caller can surface a clean error.
        """
        if not self._api_key:
            return False, "2Factor API key is not configured."

        # +91 prefix keeps 2Factor unambiguous for Indian numbers.
        to = phone if phone.startswith("+") else f"+91{phone}"
        segments = [self._api_key, "SMS", to, otp]
        if self._template_name:
            segments.append(self._template_name)
        url = f"{_BASE_URL}/" + "/".join(segments)

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.get(url)
        except httpx.HTTPError as exc:
            logger.warning("2Factor request failed: %s", exc)
            return False, "Could not reach the SMS provider."

        if resp.status_code != 200:
            logger.warning("2Factor HTTP %s: %s", resp.status_code, resp.text[:200])
            return False, "SMS provider returned an error."

        try:
            data = resp.json()
        except ValueError:
            return False, "SMS provider returned an unexpected response."

        if str(data.get("Status", "")).lower() == "success":
            # NOTE: a "Success" here means 2Factor ACCEPTED the request, not
            # that the SMS was delivered. Actual delivery depends on DLT
            # template/sender approval for the route used. We log the session
            # id and whether a custom template was used so undelivered-but-
            # accepted sends are diagnosable.
            logger.info(
                "[2Factor] accepted OTP send (session=%s, template=%s)",
                data.get("Details"),
                self._template_name or "<default-approved>",
            )
            return True, "OTP sent."

        logger.warning("2Factor non-success: %s", data)
        return False, str(data.get("Details", "SMS provider rejected the request."))


async def send_otp_via_2factor(phone: str, otp: str) -> tuple[bool, str]:
    """Convenience wrapper used by the SMS provider factory."""
    return await TwoFactorClient().send_otp(phone, otp)
