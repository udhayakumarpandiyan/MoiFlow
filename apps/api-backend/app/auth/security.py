"""
Password hashing helpers for admin accounts.

Uses the maintained `bcrypt` library directly (passlib 1.7.x is unmaintained
and breaks against bcrypt >= 4.1). Mobile users never have passwords
(OTP-only); this is purely for back-office admin accounts.

bcrypt only hashes the first 72 bytes of input, so we pre-hash the password
with SHA-256 to remove any length ceiling before bcrypt.
"""

import base64
import hashlib

import bcrypt


def _prepare(plain: str) -> bytes:
    """SHA-256 then base64 so any-length password fits bcrypt's 72-byte limit."""
    digest = hashlib.sha256(plain.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(plain: str) -> str:
    """Return a bcrypt hash (utf-8 str) for a plaintext password."""
    return bcrypt.hashpw(_prepare(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time verify a plaintext password against a stored hash."""
    try:
        return bcrypt.checkpw(_prepare(plain), hashed.encode("utf-8"))
    except Exception:
        return False
