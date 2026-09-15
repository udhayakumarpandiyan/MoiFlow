"""
SMS Provider Abstraction Layer.

Supported providers:

    console
    twilio
    msg91
    twofactor

Production should use 2Factor, Twilio, or MSG91.
"""

import logging
from abc import ABC, abstractmethod

import httpx

from app.core.config import (
    MSG91_AUTH_KEY,
    MSG91_TEMPLATE_ID,
    SMS_PROVIDER,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER,
)


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def mask_phone(phone: str) -> str:
    """
    Mask phone number for logs.

    Example:
        9876543210 -> ******3210
    """

    if len(phone) <= 4:
        return "****"

    return f"******{phone[-4:]}"


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

class SMSProvider(ABC):
    """Abstract SMS provider interface."""

    @abstractmethod
    async def send(self, phone: str, otp: str) -> bool:
        """
        Send OTP to the given Indian mobile number.

        phone:
            10-digit Indian mobile number without country code.

        Returns:
            True when SMS was accepted by provider.
            False otherwise.
        """
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Console Provider
# ---------------------------------------------------------------------------

class ConsoleSMSProvider(SMSProvider):
    """
    Development-only SMS provider.

    NEVER use in production.
    """

    async def send(self, phone: str, otp: str) -> bool:
        logger.warning(
            "[SMS-CONSOLE] OTP for +91%s: %s",
            mask_phone(phone),
            otp,
        )

        return True


# ---------------------------------------------------------------------------
# Twilio Provider
# ---------------------------------------------------------------------------

class TwilioSMSProvider(SMSProvider):
    """
    Twilio SMS provider.
    """

    def __init__(self) -> None:
        self.account_sid = TWILIO_ACCOUNT_SID
        self.auth_token = TWILIO_AUTH_TOKEN
        self.from_number = TWILIO_FROM_NUMBER

        if not self.account_sid:
            raise RuntimeError(
                "TWILIO_ACCOUNT_SID is not configured."
            )

        if not self.auth_token:
            raise RuntimeError(
                "TWILIO_AUTH_TOKEN is not configured."
            )

        if not self.from_number:
            raise RuntimeError(
                "TWILIO_FROM_NUMBER is not configured."
            )

    async def send(self, phone: str, otp: str) -> bool:
        url = (
            "https://api.twilio.com/2010-04-01/"
            f"Accounts/{self.account_sid}/Messages.json"
        )

        data = {
            "To": f"+91{phone}",
            "From": self.from_number,
            "Body": (
                f"Your MoiFlow verification code is: {otp}. "
                "Valid for 5 minutes."
            ),
        }

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(10.0)
            ) as client:

                response = await client.post(
                    url,
                    data=data,
                    auth=(
                        self.account_sid,
                        self.auth_token,
                    ),
                )

            if response.status_code in (200, 201):

                logger.info(
                    "[SMS-TWILIO] OTP sent to +91%s",
                    mask_phone(phone),
                )

                return True

            logger.error(
                "[SMS-TWILIO] Failed for +91%s. "
                "Status=%s",
                mask_phone(phone),
                response.status_code,
            )

            return False

        except httpx.TimeoutException:
            logger.error(
                "[SMS-TWILIO] Timeout sending OTP to +91%s",
                mask_phone(phone),
            )

            return False

        except httpx.HTTPError:
            logger.exception(
                "[SMS-TWILIO] HTTP error sending OTP to +91%s",
                mask_phone(phone),
            )

            return False

        except Exception:
            logger.exception(
                "[SMS-TWILIO] Unexpected error sending OTP to +91%s",
                mask_phone(phone),
            )

            return False


# ---------------------------------------------------------------------------
# MSG91 Provider
# ---------------------------------------------------------------------------

class MSG91SMSProvider(SMSProvider):
    """
    MSG91 SMS provider.
    """

    def __init__(self) -> None:
        self.auth_key = MSG91_AUTH_KEY
        self.template_id = MSG91_TEMPLATE_ID

        if not self.auth_key:
            raise RuntimeError(
                "MSG91_AUTH_KEY is not configured."
            )

        if not self.template_id:
            raise RuntimeError(
                "MSG91_TEMPLATE_ID is not configured."
            )

    async def send(self, phone: str, otp: str) -> bool:
        url = "https://control.msg91.com/api/v5/otp"

        headers = {
            "authkey": self.auth_key,
            "Content-Type": "application/json",
        }

        payload = {
            "template_id": self.template_id,
            "mobile": f"91{phone}",
            "otp": otp,
        }

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(10.0)
            ) as client:

                response = await client.post(
                    url,
                    json=payload,
                    headers=headers,
                )

            if response.status_code == 200:

                data = response.json()

                if data.get("type") == "success":

                    logger.info(
                        "[SMS-MSG91] OTP sent to +91%s",
                        mask_phone(phone),
                    )

                    return True

            logger.error(
                "[SMS-MSG91] Failed for +91%s. Status=%s",
                mask_phone(phone),
                response.status_code,
            )

            return False

        except httpx.TimeoutException:

            logger.error(
                "[SMS-MSG91] Timeout sending OTP to +91%s",
                mask_phone(phone),
            )

            return False

        except httpx.HTTPError:

            logger.exception(
                "[SMS-MSG91] HTTP error sending OTP to +91%s",
                mask_phone(phone),
            )

            return False

        except Exception:

            logger.exception(
                "[SMS-MSG91] Unexpected error sending OTP to +91%s",
                mask_phone(phone),
            )

            return False


# ---------------------------------------------------------------------------
# 2Factor Provider
# ---------------------------------------------------------------------------

class TwoFactorSMSProvider(SMSProvider):
    """
    2Factor SMS provider (https://2factor.in).

    Delegates delivery to the isolated integration client. The backend still
    owns OTP generation/verification; 2Factor is only the delivery channel.
    """

    async def send(self, phone: str, otp: str) -> bool:
        # Imported lazily so the integration module isn't required unless used.
        from app.integrations.twofactor import send_otp_via_2factor

        ok, message = await send_otp_via_2factor(phone, otp)
        if ok:
            logger.info("[SMS-2FACTOR] OTP sent to +91%s", mask_phone(phone))
        else:
            logger.error(
                "[SMS-2FACTOR] Failed for +91%s: %s", mask_phone(phone), message
            )
        return ok


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_sms_provider() -> SMSProvider:
    """
    Return configured SMS provider.
    """

    if SMS_PROVIDER == "twofactor":
        return TwoFactorSMSProvider()

    if SMS_PROVIDER == "twilio":
        return TwilioSMSProvider()

    if SMS_PROVIDER == "msg91":
        return MSG91SMSProvider()

    if SMS_PROVIDER == "console":
        return ConsoleSMSProvider()

    raise RuntimeError(
        f"Unsupported SMS provider: {SMS_PROVIDER}"
    )