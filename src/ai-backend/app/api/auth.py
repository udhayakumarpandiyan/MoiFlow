"""
Authentication API endpoints.

Endpoints:
  POST /send-otp     — Generate and send OTP
  POST /verify-otp   — Verify OTP, return session token
  POST /logout       — Invalidate session (client-side token discard)
  GET  /session      — Validate current session token
"""

from fastapi import APIRouter, HTTPException, Header
from typing import Optional

from app.schemas.otp import (
    SendOTPRequest,
    SendOTPResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
)
from app.services.otp_service import (
    generate_otp,
    check_rate_limit,
    store_otp,
    send_otp_sms,
    verify_otp,
)
from app.services.token_service import (
    create_access_token,
    verify_access_token,
)


router = APIRouter()


@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(request: SendOTPRequest):
    """Generate and send OTP to the provided phone number."""

    # Rate limiting
    allowed, rate_msg = check_rate_limit(request.phone)
    if not allowed:
        raise HTTPException(status_code=429, detail=rate_msg)

    # Generate OTP
    otp = generate_otp()
    store_otp(request.phone, otp)

    # Send via SMS provider
    sent, sms_error = await send_otp_sms(request.phone, otp)
    if not sent:
        raise HTTPException(status_code=502, detail=sms_error)

    return SendOTPResponse(
        success=True,
        message="OTP sent successfully.",
    )


@router.post("/verify-otp", response_model=VerifyOTPResponse)
async def verify_otp_endpoint(request: VerifyOTPRequest):
    """Verify the OTP and issue a session token on success."""

    is_valid, message = verify_otp(request.phone, request.otp)

    if not is_valid:
        return VerifyOTPResponse(
            verified=False,
            message=message,
            token=None,
        )

    # Issue JWT session token
    token = create_access_token(phone=request.phone, name=request.name)

    return VerifyOTPResponse(
        verified=True,
        message="OTP verified successfully.",
        token=token,
    )


@router.post("/logout")
async def logout():
    """
    Logout endpoint.
    With JWT-based auth, logout is handled client-side by discarding the token.
    This endpoint exists for future token blacklisting / server-side session invalidation.
    """
    return {"success": True, "message": "Logged out successfully."}


@router.get("/session")
async def validate_session(authorization: Optional[str] = Header(None)):
    """
    Validate the current session token.
    Returns user info if the token is valid.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization token provided.")

    # Expect "Bearer <token>"
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization format.")

    token = parts[1]
    payload = verify_access_token(token)

    if payload is None:
        raise HTTPException(status_code=401, detail="Token expired or invalid.")

    return {
        "valid": True,
        "phone": payload.get("sub"),
        "name": payload.get("name"),
    }
