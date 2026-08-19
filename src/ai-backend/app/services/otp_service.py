import random
import time
from typing import Optional


# In-memory OTP store: phone -> (otp, expiry_timestamp)
# TODO: Replace with Redis or a database for production use.
_otp_store: dict[str, tuple[str, float]] = {}

OTP_LENGTH = 6
OTP_EXPIRY_SECONDS = 300  # 5 minutes


def generate_otp() -> str:
    """Generate a random 6-digit OTP."""
    return str(random.randint(100000, 999999))


def store_otp(phone: str, otp: str) -> None:
    """Store OTP with expiry timestamp."""
    _otp_store[phone] = (otp, time.time() + OTP_EXPIRY_SECONDS)


def get_stored_otp(phone: str) -> Optional[str]:
    """Retrieve stored OTP if not expired."""
    entry = _otp_store.get(phone)
    if entry is None:
        return None
    otp, expiry = entry
    if time.time() > expiry:
        # Expired — clean up
        _otp_store.pop(phone, None)
        return None
    return otp


def verify_otp(phone: str, otp: str) -> bool:
    """Verify OTP and consume it on success."""
    stored = get_stored_otp(phone)
    if stored is None:
        return False
    if stored == otp:
        # Consume OTP after successful verification
        _otp_store.pop(phone, None)
        return True
    return False


async def send_otp_sms(phone: str, otp: str) -> bool:
    """
    Send OTP via SMS gateway.

    TODO: Integrate with a real SMS provider (Twilio, MSG91, etc.)
    For now this logs the OTP and returns success.
    """
    print(f"[OTP] Sending OTP {otp} to +91 {phone}")
    # Simulate network latency
    # In production, replace with actual HTTP call to SMS gateway:
    # e.g., httpx.AsyncClient().post("https://api.msg91.com/...", ...)
    return True
