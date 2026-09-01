"""
Production OTP Service with pluggable store and SMS provider.

Configuration via environment variables:
  OTP_STORE_BACKEND    = "memory" | "redis"  (default: memory)
  OTP_LENGTH           = 6
  OTP_EXPIRY_SECONDS   = 300
  OTP_MAX_ATTEMPTS     = 5       (max verify attempts per OTP)
  OTP_MAX_SEND_PER_HOUR = 5     (rate limit: max OTPs per phone per hour)
  REDIS_URL            = redis://localhost:6379/0

  SMS_PROVIDER         = "console" | "twilio" | "msg91"
  TWILIO_ACCOUNT_SID   = ...
  TWILIO_AUTH_TOKEN    = ...
  TWILIO_FROM_NUMBER   = ...
  MSG91_AUTH_KEY       = ...
  MSG91_SENDER_ID      = ...
  MSG91_TEMPLATE_ID    = ...
"""

import os
import time
import secrets
from typing import Optional
from dataclasses import dataclass, field

from app.services.sms_provider import get_sms_provider

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OTP_LENGTH = int(os.getenv("OTP_LENGTH", "6"))
OTP_EXPIRY_SECONDS = int(os.getenv("OTP_EXPIRY_SECONDS", "300"))
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
OTP_MAX_SEND_PER_HOUR = int(os.getenv("OTP_MAX_SEND_PER_HOUR", "5"))
OTP_STORE_BACKEND = os.getenv("OTP_STORE_BACKEND", "memory")


# ---------------------------------------------------------------------------
# OTP Record
# ---------------------------------------------------------------------------

@dataclass
class OTPRecord:
    otp: str
    phone: str
    created_at: float
    expires_at: float
    attempts: int = 0
    verified: bool = False


# ---------------------------------------------------------------------------
# Store Interface & Implementations
# ---------------------------------------------------------------------------

class OTPStore:
    """Abstract OTP store interface."""

    def save(self, phone: str, record: OTPRecord) -> None:
        raise NotImplementedError

    def get(self, phone: str) -> Optional[OTPRecord]:
        raise NotImplementedError

    def delete(self, phone: str) -> None:
        raise NotImplementedError

    def increment_attempts(self, phone: str) -> int:
        raise NotImplementedError

    def get_send_count(self, phone: str) -> int:
        raise NotImplementedError

    def increment_send_count(self, phone: str) -> None:
        raise NotImplementedError


class MemoryOTPStore(OTPStore):
    """In-memory OTP store (suitable for development / single-instance)."""

    def __init__(self):
        self._store: dict[str, OTPRecord] = {}
        self._send_counts: dict[str, list[float]] = {}

    def save(self, phone: str, record: OTPRecord) -> None:
        self._store[phone] = record

    def get(self, phone: str) -> Optional[OTPRecord]:
        record = self._store.get(phone)
        if record is None:
            return None
        if time.time() > record.expires_at:
            self.delete(phone)
            return None
        return record

    def delete(self, phone: str) -> None:
        self._store.pop(phone, None)

    def increment_attempts(self, phone: str) -> int:
        record = self._store.get(phone)
        if record:
            record.attempts += 1
            return record.attempts
        return 0

    def get_send_count(self, phone: str) -> int:
        now = time.time()
        one_hour_ago = now - 3600
        timestamps = self._send_counts.get(phone, [])
        # Clean up old entries
        timestamps = [t for t in timestamps if t > one_hour_ago]
        self._send_counts[phone] = timestamps
        return len(timestamps)

    def increment_send_count(self, phone: str) -> None:
        if phone not in self._send_counts:
            self._send_counts[phone] = []
        self._send_counts[phone].append(time.time())


class RedisOTPStore(OTPStore):
    """Redis-backed OTP store for production multi-instance deployments."""

    def __init__(self):
        import redis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self._redis = redis.from_url(redis_url, decode_responses=True)

    def _key(self, phone: str) -> str:
        return f"otp:{phone}"

    def _rate_key(self, phone: str) -> str:
        return f"otp_rate:{phone}"

    def save(self, phone: str, record: OTPRecord) -> None:
        import json
        key = self._key(phone)
        data = {
            "otp": record.otp,
            "phone": record.phone,
            "created_at": record.created_at,
            "expires_at": record.expires_at,
            "attempts": record.attempts,
            "verified": record.verified,
        }
        self._redis.setex(key, OTP_EXPIRY_SECONDS, json.dumps(data))

    def get(self, phone: str) -> Optional[OTPRecord]:
        import json
        key = self._key(phone)
        raw = self._redis.get(key)
        if raw is None:
            return None
        data = json.loads(raw)
        return OTPRecord(**data)

    def delete(self, phone: str) -> None:
        self._redis.delete(self._key(phone))

    def increment_attempts(self, phone: str) -> int:
        import json
        key = self._key(phone)
        raw = self._redis.get(key)
        if raw is None:
            return 0
        data = json.loads(raw)
        data["attempts"] += 1
        ttl = self._redis.ttl(key)
        if ttl > 0:
            self._redis.setex(key, ttl, json.dumps(data))
        return data["attempts"]

    def get_send_count(self, phone: str) -> int:
        key = self._rate_key(phone)
        count = self._redis.get(key)
        return int(count) if count else 0

    def increment_send_count(self, phone: str) -> None:
        key = self._rate_key(phone)
        pipe = self._redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, 3600)  # 1 hour window
        pipe.execute()


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def _create_store() -> OTPStore:
    if OTP_STORE_BACKEND == "redis":
        return RedisOTPStore()
    return MemoryOTPStore()


_store = _create_store()
_sms_provider = get_sms_provider()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_otp() -> str:
    """Generate a cryptographically secure random OTP."""
    # Use secrets module for cryptographic randomness
    max_val = 10 ** OTP_LENGTH - 1
    min_val = 10 ** (OTP_LENGTH - 1)
    return str(secrets.randbelow(max_val - min_val + 1) + min_val)


def check_rate_limit(phone: str) -> tuple[bool, str]:
    """
    Check if the phone number has exceeded the send rate limit.
    Returns (is_allowed, error_message).
    """
    count = _store.get_send_count(phone)
    if count >= OTP_MAX_SEND_PER_HOUR:
        return False, "Too many OTP requests. Please try again later."
    return True, ""


def store_otp(phone: str, otp: str) -> None:
    """Store OTP with metadata."""
    now = time.time()
    record = OTPRecord(
        otp=otp,
        phone=phone,
        created_at=now,
        expires_at=now + OTP_EXPIRY_SECONDS,
        attempts=0,
        verified=False,
    )
    _store.save(phone, record)
    _store.increment_send_count(phone)


def verify_otp(phone: str, otp: str) -> tuple[bool, str]:
    """
    Verify OTP and return (is_valid, error_message).
    Handles attempt counting and expiry.
    """
    record = _store.get(phone)

    if record is None:
        return False, "OTP expired or not found. Please request a new one."

    if record.verified:
        return False, "OTP already used. Please request a new one."

    # Check attempt limit
    if record.attempts >= OTP_MAX_ATTEMPTS:
        _store.delete(phone)
        return False, "Too many failed attempts. Please request a new OTP."

    # Increment attempts before checking
    _store.increment_attempts(phone)

    if record.otp != otp:
        remaining = OTP_MAX_ATTEMPTS - (record.attempts + 1)
        if remaining <= 0:
            _store.delete(phone)
            return False, "Too many failed attempts. Please request a new OTP."
        return False, f"Invalid OTP. {remaining} attempt(s) remaining."

    # Success — mark as verified and consume
    _store.delete(phone)
    return True, "OTP verified successfully."


async def send_otp_sms(phone: str, otp: str) -> tuple[bool, str]:
    """
    Send OTP via the configured SMS provider.
    Returns (success, error_message).
    """
    try:
        success = await _sms_provider.send(phone, otp)
        if success:
            return True, ""
        return False, "Failed to send OTP. Please try again."
    except Exception as e:
        print(f"[OTP] SMS send error for {phone}: {e}")
        return False, "SMS service temporarily unavailable. Please try again."
