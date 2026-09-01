from typing import Optional

from pydantic import BaseModel, Field


class SendOTPRequest(BaseModel):
    phone: str = Field(..., pattern=r"^[6-9]\d{9}$", description="10-digit Indian mobile number")
    name: str = Field(..., min_length=1)


class SendOTPResponse(BaseModel):
    success: bool
    message: str


class VerifyOTPRequest(BaseModel):
    phone: str = Field(..., pattern=r"^[6-9]\d{9}$")
    name: str = Field(default="", description="User name for token payload")
    otp: str = Field(..., min_length=6, max_length=6)


class VerifyOTPResponse(BaseModel):
    verified: bool
    message: str
    token: Optional[str] = None
