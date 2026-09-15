"""Pydantic schemas for the admin API."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    # Plain string (not EmailStr): login is an exact-match lookup, and
    # email-validator rejects reserved TLDs like .test/.local which are valid
    # for internal/admin accounts. Real validation is the password check.
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=200)


class AdminLoginResponse(BaseModel):
    token: str
    name: str
    role: str


class AdminProfile(BaseModel):
    id: str
    email: str
    name: str
    role: str
    last_login_at: Optional[str] = None


class SystemConfigResponse(BaseModel):
    """Non-secret operational config surfaced to the admin portal."""

    environment: str
    sms_provider: str
    ai_provider: str
    otp_expiry_seconds: int
    otp_max_send_per_hour: int
    plans: list[dict[str, Any]]
