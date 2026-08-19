from fastapi import APIRouter, HTTPException

from app.schemas.otp import (
    SendOTPRequest,
    SendOTPResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
)
from app.services.otp_service import (
    generate_otp,
    store_otp,
    send_otp_sms,
    verify_otp,
)


router = APIRouter()


@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(request: SendOTPRequest):
    """Generate and send OTP to the provided phone number."""
    otp = generate_otp()
    store_otp(request.phone, otp)

    sent = await send_otp_sms(request.phone, otp)
    if not sent:
        raise HTTPException(status_code=502, detail="Failed to send OTP via SMS")

    return SendOTPResponse(
        success=True,
        message="OTP sent successfully",
    )


@router.post("/verify-otp", response_model=VerifyOTPResponse)
async def verify_otp_endpoint(request: VerifyOTPRequest):
    """Verify the OTP submitted by the user."""
    is_valid = verify_otp(request.phone, request.otp)

    if not is_valid:
        return VerifyOTPResponse(
            verified=False,
            message="Invalid or expired OTP",
        )

    return VerifyOTPResponse(
        verified=True,
        message="OTP verified successfully",
    )
