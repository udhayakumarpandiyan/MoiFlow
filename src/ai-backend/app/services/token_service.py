"""
JWT token service for MoiFlow.

Creates and verifies access tokens after successful authentication.

The JWT contains the authenticated user's ID rather than sensitive
or mutable user information such as phone number or name.

The mobile app sends the token using:

    Authorization: Bearer <token>
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.config import (
    JWT_ALGORITHM,
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_SECRET_KEY,
)


# ---------------------------------------------------------------------------
# Token creation
# ---------------------------------------------------------------------------

def create_access_token(
    user_id: str,
) -> str:
    """
    Create a JWT access token.

    Args:
        user_id:
            Unique user ID from the database.

    Returns:
        Encoded JWT string.
    """

    now = datetime.now(timezone.utc)

    expire = now + timedelta(
        minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": expire,
        "type": "access",
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

def verify_access_token(
    token: str,
) -> dict[str, Any] | None:
    """
    Verify and decode a JWT access token.

    Returns:
        Payload dictionary if valid.

        None if:
            - token is malformed
            - token is expired
            - signature is invalid
            - token type is invalid
            - subject is missing
    """

    try:

        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        # Ensure this is an access token.
        if payload.get("type") != "access":
            return None

        # Every authenticated token must have a subject.
        user_id = payload.get("sub")

        if not user_id:
            return None

        return payload

    except JWTError:
        return None

    except Exception:
        return None