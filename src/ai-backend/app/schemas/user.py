"""
Pydantic schemas for User responses.

These are the shapes the API returns — never return ORM models directly.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class UserResponse(BaseModel):
    """Public user profile returned to the mobile app."""

    id: uuid.UUID
    phone: str
    name: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
