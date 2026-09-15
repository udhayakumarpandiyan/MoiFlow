"""
Pydantic schemas for OTP authentication.
"""

from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Send OTP
# ---------------------------------------------------------------------------

class SendOTPRequest(BaseModel):
    """
    Request to send an OTP.

    The mobile app sends both phone and name.
    name is optional here — used for personalised SMS in future.
    """

    phone: str = Field(
        ...,
        pattern=r"^[6-9]\d{9}$",
        description="10-digit Indian mobile number",
        examples=["9876543210"],
    )

    name: Optional[str] = Field(
        default=None,
        max_length=100,
        description="User's name (optional, used for personalised SMS)",
        examples=["Kumar"],
    )


class SendOTPResponse(BaseModel):
    success: bool
    message: str


# ---------------------------------------------------------------------------
# Verify OTP
# ---------------------------------------------------------------------------

class VerifyOTPRequest(BaseModel):
    """
    Request to verify an OTP.

    The mobile app sends phone, name, and otp.
    name is carried through so completeRegistration can store it.
    """

    phone: str = Field(
        ...,
        pattern=r"^[6-9]\d{9}$",
        description="10-digit Indian mobile number",
        examples=["9876543210"],
    )

    name: Optional[str] = Field(
        default=None,
        max_length=100,
        description="User's name",
        examples=["Kumar"],
    )

    otp: str = Field(
        ...,
        pattern=r"^\d{6}$",
        description="6-digit OTP",
        examples=["123456"],
    )

    # Optional device metadata for session tracking (never required).
    device_id: Optional[str] = Field(
        default=None,
        max_length=128,
        description="App-generated stable device identifier",
    )
    platform: Optional[str] = Field(
        default=None,
        max_length=20,
        description="android | ios",
    )
    app_version: Optional[str] = Field(default=None, max_length=20)


class VerifyOTPResponse(BaseModel):
    verified: bool
    message: str
    token: Optional[str] = None
