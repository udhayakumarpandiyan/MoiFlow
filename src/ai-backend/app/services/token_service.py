"""
JWT token service for session management.

Generates access tokens upon successful OTP verification.
The mobile app stores these tokens and includes them in
authenticated API requests.
"""

from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError

from app.config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_ACCESS_TOKEN_EXPIRE_MINUTES


def create_access_token(phone: str, name: str) -> str:
    """
    Create a JWT access token for the authenticated user.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": phone,
        "name": name,
        "iat": now,
        "exp": expire,
        "type": "access",
    }

    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_access_token(token: str) -> dict | None:
    """
    Verify and decode a JWT access token.
    Returns the payload dict on success, None on failure/expiry.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None
