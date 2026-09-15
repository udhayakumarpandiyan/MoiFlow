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

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import SMS_PROVIDER
from app.db.database import get_db
from app.repositories.otp_repository import OTPRequestRepository
from app.repositories.session_repository import SessionRepository
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
    normalize_phone,
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


def _client_ip(request: Request) -> Optional[str]:
    """Best-effort client IP, honouring a single X-Forwarded-For hop."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


# ---------------------------------------------------------------------------
# Send OTP
# ---------------------------------------------------------------------------

@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(
    request: SendOTPRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate and send an OTP to the given mobile number.

    If this is a new phone number an unverified user record is created
    so the name is captured before OTP verification.
    If the phone is already registered, the existing record is reused
    (re-registration / re-login).

    The 2Factor (or other) provider API key stays server-side; the mobile
    app only ever calls this endpoint.
    """
    repo = UserRepository(db)
    otp_history = OTPRequestRepository(db)
    ip = _client_ip(http_request)

    # Rate limiting (per phone, hourly window)
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

    # Record the attempt in history (best-effort; never blocks the flow).
    try:
        await otp_history.record_send(
            phone=normalize_phone(request.phone),
            channel=SMS_PROVIDER,
            delivered=sent,
            purpose="login",
            ip_address=ip,
        )
    except Exception:  # pragma: no cover — history must not break auth
        logger.exception("Failed to record OTP request history.")

    if not sent:
        raise HTTPException(status_code=502, detail=sms_error)

    return SendOTPResponse(success=True, message="OTP sent successfully.")


# ---------------------------------------------------------------------------
# Verify OTP
# ---------------------------------------------------------------------------

@router.post("/verify-otp", response_model=VerifyOTPResponse)
async def verify_otp_endpoint(
    request: VerifyOTPRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify OTP and issue a JWT access token.

    On success:
        - User is marked as verified in PostgreSQL.
        - last_login_at is updated.
        - A device session is recorded (if device_id supplied).
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

    # Record a device session (best-effort) so the token can be attributed
    # to a device and optionally revoked later.
    if request.device_id:
        try:
            from app.services.token_service import verify_access_token as _decode

            payload = _decode(token) or {}
            await SessionRepository(db).upsert_on_login(
                user_id=user.id,
                device_id=request.device_id,
                platform=(request.platform or "android"),
                app_version=request.app_version,
                token_jti=payload.get("jti"),
                ip_address=_client_ip(http_request),
            )
        except Exception:  # pragma: no cover
            logger.exception("Failed to record device session.")

    # Mark the latest OTP history row verified (best-effort).
    try:
        await OTPRequestRepository(db).mark_latest_verified(
            normalize_phone(request.phone)
        )
    except Exception:  # pragma: no cover
        logger.exception("Failed to mark OTP history verified.")

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

    if payload is None or payload.get("type") != "access":
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
