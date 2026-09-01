"""
SMS Provider Abstraction Layer.

Supports multiple providers via SMS_PROVIDER environment variable:
  - "console" (default): Logs OTP to stdout (development)
  - "twilio": Sends via Twilio SMS API
  - "msg91": Sends via MSG91 API

Each provider implements the SMSProvider interface.
Adding a new provider requires:
  1. Create a class implementing SMSProvider
  2. Add it to the get_sms_provider() factory
"""

import os
from abc import ABC, abstractmethod


class SMSProvider(ABC):
    """Abstract SMS provider interface."""

    @abstractmethod
    async def send(self, phone: str, otp: str) -> bool:
        """
        Send OTP to the given phone number.
        Phone is a 10-digit Indian mobile number (without country code).
        Returns True on success, False on failure.
        """
        ...


class ConsoleSMSProvider(SMSProvider):
    """
    Development-only provider that logs OTP to console.
    Never use in production.
    """

    async def send(self, phone: str, otp: str) -> bool:
        print(f"[SMS-Console] OTP for +91 {phone}: {otp}")
        return True


class TwilioSMSProvider(SMSProvider):
    """
    Twilio SMS provider.

    Required env vars:
      TWILIO_ACCOUNT_SID
      TWILIO_AUTH_TOKEN
      TWILIO_FROM_NUMBER
    """

    def __init__(self):
        self.account_sid = os.environ["TWILIO_ACCOUNT_SID"]
        self.auth_token = os.environ["TWILIO_AUTH_TOKEN"]
        self.from_number = os.environ["TWILIO_FROM_NUMBER"]

    async def send(self, phone: str, otp: str) -> bool:
        import httpx

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        data = {
            "To": f"+91{phone}",
            "From": self.from_number,
            "Body": f"Your MoiFlow verification code is: {otp}. Valid for 5 minutes.",
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                data=data,
                auth=(self.account_sid, self.auth_token),
                timeout=10.0,
            )

        if response.status_code in (200, 201):
            print(f"[SMS-Twilio] Sent OTP to +91 {phone}")
            return True

        print(f"[SMS-Twilio] Failed for +91 {phone}: {response.status_code} {response.text}")
        return False


class MSG91SMSProvider(SMSProvider):
    """
    MSG91 SMS provider (popular in India).

    Required env vars:
      MSG91_AUTH_KEY
      MSG91_TEMPLATE_ID
    """

    def __init__(self):
        self.auth_key = os.environ["MSG91_AUTH_KEY"]
        self.template_id = os.environ["MSG91_TEMPLATE_ID"]

    async def send(self, phone: str, otp: str) -> bool:
        import httpx

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

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=headers,
                timeout=10.0,
            )

        if response.status_code == 200:
            data = response.json()
            if data.get("type") == "success":
                print(f"[SMS-MSG91] Sent OTP to +91 {phone}")
                return True

        print(f"[SMS-MSG91] Failed for +91 {phone}: {response.status_code} {response.text}")
        return False


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_sms_provider() -> SMSProvider:
    """
    Return the configured SMS provider based on SMS_PROVIDER env var.
    Defaults to ConsoleSMSProvider for development.
    """
    provider_name = os.getenv("SMS_PROVIDER", "console").lower()

    if provider_name == "twilio":
        return TwilioSMSProvider()
    elif provider_name == "msg91":
        return MSG91SMSProvider()
    else:
        if provider_name != "console":
            print(f"[SMS] Unknown provider '{provider_name}', falling back to console")
        return ConsoleSMSProvider()
