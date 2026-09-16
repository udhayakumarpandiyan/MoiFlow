"""
Production OTP Service.

Responsibilities:

    - Generate secure OTP
    - Store OTP securely
    - OTP expiration
    - Verification attempt limiting
    - OTP send rate limiting
    - SMS delivery
    - Redis support for production
    - In-memory support for local development

Production configuration:

    OTP_STORE_BACKEND=redis
    REDIS_URL=redis://...
    SMS_PROVIDER=twilio
"""

import hashlib
import hmac
import logging
import secrets
import time

from dataclasses import dataclass
from typing import Optional

from app.core.config import (
    OTP_EXPIRY_SECONDS,
    OTP_LENGTH,
    OTP_MAX_ATTEMPTS,
    OTP_MAX_SEND_PER_HOUR,
    OTP_STORE_BACKEND,
)

from app.services.sms_provider import get_sms_provider


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_phone(phone: str) -> str:
    """
    Normalize Indian mobile number.

    Accepts:

        9876543210
        +919876543210
        919876543210

    Stores internally as:

        9876543210
    """

    phone = phone.strip().replace(" ", "").replace("-", "")

    if phone.startswith("+91"):
        phone = phone[3:]
    elif phone.startswith("91") and len(phone) == 12:
        phone = phone[2:]

    if not phone.isdigit():
        raise ValueError("Invalid mobile number.")

    if len(phone) != 10:
        raise ValueError("Mobile number must contain 10 digits.")

    if phone[0] not in "6789":
        raise ValueError("Invalid Indian mobile number.")

    return phone


def hash_otp(phone: str, otp: str) -> str:
    """
    Hash OTP before storage.

    Includes the phone number as a salt/input so the same OTP
    generated for different users does not produce the same hash.
    """

    value = f"{phone}:{otp}".encode("utf-8")

    return hashlib.sha256(value).hexdigest()


# ---------------------------------------------------------------------------
# OTP Record
# ---------------------------------------------------------------------------

@dataclass
class OTPRecord:
    otp_hash: str
    phone: str
    created_at: float
    expires_at: float
    attempts: int = 0


# ---------------------------------------------------------------------------
# Store Interface
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


# ---------------------------------------------------------------------------
# Memory Store
# ---------------------------------------------------------------------------

class MemoryOTPStore(OTPStore):
    """
    In-memory OTP store.

    Development only.

    Do NOT use for production or multi-instance deployment.
    """

    def __init__(self) -> None:
        self._store: dict[str, OTPRecord] = {}
        self._send_counts: dict[str, list[float]] = {}

    def save(
        self,
        phone: str,
        record: OTPRecord,
    ) -> None:
        self._store[phone] = record

    def get(
        self,
        phone: str,
    ) -> Optional[OTPRecord]:

        record = self._store.get(phone)

        if record is None:
            return None

        if time.time() >= record.expires_at:
            self.delete(phone)
            return None

        return record

    def delete(self, phone: str) -> None:
        self._store.pop(phone, None)

    def increment_attempts(self, phone: str) -> int:

        record = self._store.get(phone)

        if record is None:
            return 0

        record.attempts += 1

        return record.attempts

    def get_send_count(self, phone: str) -> int:

        now = time.time()
        one_hour_ago = now - 3600

        timestamps = self._send_counts.get(phone, [])

        timestamps = [
            timestamp
            for timestamp in timestamps
            if timestamp > one_hour_ago
        ]

        self._send_counts[phone] = timestamps

        return len(timestamps)

    def increment_send_count(self, phone: str) -> None:

        if phone not in self._send_counts:
            self._send_counts[phone] = []

        self._send_counts[phone].append(time.time())


# ---------------------------------------------------------------------------
# Redis Store
# ---------------------------------------------------------------------------

class RedisOTPStore(OTPStore):
    """
    Redis-backed OTP store.

    Required for production.
    """

    def __init__(self) -> None:

        import redis

        from app.core.config import REDIS_URL

        # Short timeouts so a misconfigured/unreachable Redis fails fast with a
        # clear error instead of hanging the OTP request for ~10s.
        self._redis = redis.Redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )

    def _key(self, phone: str) -> str:
        return f"moiflow:otp:{phone}"

    def _rate_key(self, phone: str) -> str:
        return f"moiflow:otp:rate:{phone}"

    def save(
        self,
        phone: str,
        record: OTPRecord,
    ) -> None:

        import json

        data = {
            "otp_hash": record.otp_hash,
            "phone": record.phone,
            "created_at": record.created_at,
            "expires_at": record.expires_at,
            "attempts": record.attempts,
        }

        self._redis.setex(
            self._key(phone),
            OTP_EXPIRY_SECONDS,
            json.dumps(data),
        )

    def get(
        self,
        phone: str,
    ) -> Optional[OTPRecord]:

        import json

        raw = self._redis.get(
            self._key(phone)
        )

        if raw is None:
            return None

        data = json.loads(raw)

        if time.time() >= data["expires_at"]:
            self.delete(phone)
            return None

        return OTPRecord(**data)

    def delete(self, phone: str) -> None:

        self._redis.delete(
            self._key(phone)
        )

    def increment_attempts(
        self,
        phone: str,
    ) -> int:

        import json

        key = self._key(phone)

        raw = self._redis.get(key)

        if raw is None:
            return 0

        data = json.loads(raw)

        data["attempts"] += 1

        ttl = self._redis.ttl(key)

        if ttl > 0:
            self._redis.setex(
                key,
                ttl,
                json.dumps(data),
            )

        return data["attempts"]

    def get_send_count(
        self,
        phone: str,
    ) -> int:

        value = self._redis.get(
            self._rate_key(phone)
        )

        return int(value) if value else 0

    def increment_send_count(
        self,
        phone: str,
    ) -> None:

        key = self._rate_key(phone)

        # Atomic increment.
        count = self._redis.incr(key)

        # Set expiry only when this is the first request
        # in the current window.
        if count == 1:
            self._redis.expire(
                key,
                3600,
            )


# ---------------------------------------------------------------------------
# Store Factory
# ---------------------------------------------------------------------------

def _create_store() -> OTPStore:

    if OTP_STORE_BACKEND == "redis":
        return RedisOTPStore()

    if OTP_STORE_BACKEND == "memory":
        return MemoryOTPStore()

    raise RuntimeError(
        f"Unsupported OTP store backend: {OTP_STORE_BACKEND}"
    )


_store = _create_store()
_sms_provider = get_sms_provider()


# ---------------------------------------------------------------------------
# OTP Generation
# ---------------------------------------------------------------------------

def generate_otp() -> str:
    """
    Generate cryptographically secure numeric OTP.
    """

    minimum = 10 ** (OTP_LENGTH - 1)
    maximum = (10 ** OTP_LENGTH) - 1

    return str(
        secrets.randbelow(
            maximum - minimum + 1
        ) + minimum
    )


# ---------------------------------------------------------------------------
# Rate Limiting
# ---------------------------------------------------------------------------

def check_rate_limit(
    phone: str,
) -> tuple[bool, str]:
    """
    Check hourly OTP send limit.

    Fails OPEN on store/infrastructure errors: if the OTP store (e.g. Redis) is
    temporarily unreachable we log loudly and ALLOW the send rather than
    blocking a legitimate signup on a transient infra blip. This never bypasses
    OTP verification itself — it only relaxes the per-hour send counter when the
    counter backend is unavailable.
    """

    phone = normalize_phone(phone)

    try:
        count = _store.get_send_count(phone)
    except Exception:
        logger.exception(
            "[OTP] Rate-limit store unavailable; allowing send (fail-open). "
            "Check REDIS_URL / OTP store connectivity."
        )
        return True, ""

    if count >= OTP_MAX_SEND_PER_HOUR:
        return (
            False,
            "Too many OTP requests. Please try again later.",
        )

    return True, ""


# ---------------------------------------------------------------------------
# Store OTP
# ---------------------------------------------------------------------------

def store_otp(
    phone: str,
    otp: str,
) -> None:
    """
    Store hashed OTP and increment send count.
    """

    phone = normalize_phone(phone)

    now = time.time()

    record = OTPRecord(
        otp_hash=hash_otp(phone, otp),
        phone=phone,
        created_at=now,
        expires_at=now + OTP_EXPIRY_SECONDS,
        attempts=0,
    )

    _store.save(
        phone,
        record,
    )

    _store.increment_send_count(
        phone
    )


# ---------------------------------------------------------------------------
# Send OTP
# ---------------------------------------------------------------------------

async def send_otp_sms(
    phone: str,
    otp: str,
) -> tuple[bool, str]:
    """
    Send OTP through configured SMS provider.

    IMPORTANT:
        The OTP should be stored only after SMS delivery succeeds.
    """

    try:

        phone = normalize_phone(phone)

        success = await _sms_provider.send(
            phone,
            otp,
        )

        if not success:

            logger.warning(
                "[OTP] SMS delivery failed for phone ending %s",
                phone[-4:],
            )

            return (
                False,
                "Failed to send OTP. Please try again.",
            )

        # Store only after successful SMS submission. If the store (Redis) is
        # down we cannot later verify this OTP, so treat it as a failure with a
        # clear, distinct log — the SMS provider is NOT the problem here.
        try:
            store_otp(
                phone,
                otp,
            )
        except Exception:
            logger.exception(
                "[OTP] OTP store write failed after SMS send. The code was "
                "delivered but cannot be verified. Check REDIS_URL / OTP store."
            )
            return (
                False,
                "Verification is temporarily unavailable. Please try again.",
            )

        return True, ""

    except ValueError as exc:

        return False, str(exc)

    except Exception:

        logger.exception(
            "[OTP] Unexpected error while sending OTP."
        )

        return (
            False,
            "SMS service temporarily unavailable. Please try again.",
        )


# ---------------------------------------------------------------------------
# Verify OTP
# ---------------------------------------------------------------------------

def verify_otp(
    phone: str,
    otp: str,
) -> tuple[bool, str]:
    """
    Verify OTP.

    Rules:

        - OTP must exist.
        - OTP must not be expired.
        - Maximum attempts enforced.
        - OTP is consumed after successful verification.
    """

    try:
        phone = normalize_phone(phone)
    except ValueError as exc:
        return False, str(exc)

    record = _store.get(phone)

    if record is None:

        return (
            False,
            "OTP expired or not found. Please request a new one.",
        )

    if record.attempts >= OTP_MAX_ATTEMPTS:

        _store.delete(phone)

        return (
            False,
            "Too many failed attempts. Please request a new OTP.",
        )

    # Increment attempt BEFORE checking OTP.
    attempts = _store.increment_attempts(phone)

    expected_hash = record.otp_hash
    actual_hash = hash_otp(phone, otp)

    is_valid = hmac.compare_digest(
        expected_hash,
        actual_hash,
    )

    if not is_valid:

        remaining = OTP_MAX_ATTEMPTS - attempts

        if remaining <= 0:

            _store.delete(phone)

            return (
                False,
                "Too many failed attempts. Please request a new OTP.",
            )

        return (
            False,
            f"Invalid OTP. {remaining} attempt(s) remaining.",
        )

    # Successful OTP verification.
    # Consume the OTP immediately.
    _store.delete(phone)

    return (
        True,
        "OTP verified successfully.",
    )