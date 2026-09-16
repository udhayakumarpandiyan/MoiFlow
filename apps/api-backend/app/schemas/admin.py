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


# --- Admin-user management (superadmin only) --------------------------------

VALID_ADMIN_ROLES = ("superadmin", "admin", "viewer")


class AdminUserSummary(BaseModel):
    """An admin account as shown in the admin-users list."""

    id: str
    email: str
    name: str
    role: str
    is_active: bool
    created_at: str
    last_login_at: Optional[str] = None


class CreateAdminRequest(BaseModel):
    # Plain string for the same reason as login (reserved TLDs are valid for
    # internal admin accounts). Uniqueness is enforced at the DB/endpoint.
    email: str = Field(..., min_length=3, max_length=255)
    name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=200)
    role: str = Field(default="admin")


class UpdateAdminRequest(BaseModel):
    """Partial update of an admin account (any subset of fields)."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    role: Optional[str] = Field(default=None)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=200)


class SystemConfigResponse(BaseModel):
    """Non-secret operational config surfaced to the admin portal."""

    environment: str
    sms_provider: str
    ai_provider: str
    otp_expiry_seconds: int
    otp_max_send_per_hour: int
    plans: list[dict[str, Any]]
