"""
Authentication API endpoints.

Endpoints:

    POST /api/auth/send-otp
        Generate and send OTP.  Creates an unverified user record if
        the phone number is new.

    POST /api/auth/verify-otp
        Verify OTP.  Marks user as verified and returns a JWT that
        contains the real user UUID as the subject.

    POST /api/auth/logout
        Client-side logout (JWT is stateless; client discards token).

    GET /api/auth/session
        Validate current JWT session and return user profile.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.repositories.user_repository import UserRepository
from app.schemas.otp import (
    SendOTPRequest,
    SendOTPResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
)
from app.schemas.user import UserResponse
from app.services.otp_service import (
    check_rate_limit,
    generate_otp,
    send_otp_sms,
    verify_otp,
)
from app.services.token_service import (
    create_access_token,
    verify_access_token,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization token required.")

    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise HTTPException(status_code=401, detail="Invalid authorization header.")

    return parts[1]


# ---------------------------------------------------------------------------
# Send OTP
# ---------------------------------------------------------------------------

@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(
    request: SendOTPRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate and send an OTP to the given mobile number.

    If this is a new phone number an unverified user record is created
    so the name is captured before OTP verification.
    If the phone is already registered, the existing record is reused
    (re-registration / re-login).
    """
    repo = UserRepository(db)

    # Rate limiting
    try:
        allowed, rate_message = check_rate_limit(request.phone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not allowed:
        raise HTTPException(status_code=429, detail=rate_message)

    # Create user record if first-time registration
    name = (request.name or "").strip() or "User"
    existing = await repo.get_by_phone(request.phone)
    if existing is None:
        await repo.create(phone=request.phone, name=name)
    elif request.name and request.name.strip():
        # Update name in case it changed
        await repo.update_name(existing, name)

    # Generate and send OTP
    otp = generate_otp()
    sent, sms_error = await send_otp_sms(request.phone, otp)
    if not sent:
        raise HTTPException(status_code=502, detail=sms_error)

    return SendOTPResponse(success=True, message="OTP sent successfully.")


# ---------------------------------------------------------------------------
# Verify OTP
# ---------------------------------------------------------------------------

@router.post("/verify-otp", response_model=VerifyOTPResponse)
async def verify_otp_endpoint(
    request: VerifyOTPRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify OTP and issue a JWT access token.

    On success:
        - User is marked as verified in PostgreSQL.
        - last_login_at is updated.
        - JWT subject is the user's UUID (not phone number).
    """
    is_valid, message = verify_otp(request.phone, request.otp)

    if not is_valid:
        return VerifyOTPResponse(verified=False, message=message, token=None)

    # Look up the user that was created during send-otp
    repo = UserRepository(db)
    user = await repo.get_by_phone(request.phone)

    if user is None:
        # Edge case: user not found (e.g., created before DB migration).
        # Create it now.
        name = (request.name or "").strip() or "User"
        user = await repo.create(phone=request.phone, name=name)

    # Mark verified and record login time
    user = await repo.verify(user)

    # Issue JWT with the real user UUID as subject
    token = create_access_token(user_id=str(user.id))

    return VerifyOTPResponse(
        verified=True,
        message="OTP verified successfully.",
        token=token,
    )


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

@router.post("/logout")
async def logout():
    """
    Logout — JWT is stateless; client should discard the token.
    Server-side revocation can be added via a Redis deny-list if needed.
    """
    return {"success": True, "message": "Logged out successfully."}


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

@router.get("/session", response_model=UserResponse)
async def validate_session(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate the JWT and return the authenticated user's profile.

    Header:
        Authorization: Bearer <token>
    """
    token = _extract_bearer_token(authorization)
    payload = verify_access_token(token)

    if payload is None:
        raise HTTPException(status_code=401, detail="Token expired or invalid.")

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid token payload.")

    try:
        import uuid
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token subject.")

    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)

    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated.")

    return UserResponse.model_validate(user)
