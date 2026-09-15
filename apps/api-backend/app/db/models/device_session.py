"""
Device / session ORM model.

Tracks the devices a user has authenticated from. JWTs are stateless, but this
table gives us: an audit trail of logins, the ability to show "active devices"
to the user/admin, and an optional server-side revocation deny-list (set
revoked=True to force re-login).
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class DeviceSession(Base):
    """A single authenticated device/session for a user."""

    __tablename__ = "device_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # A stable id issued by the app for the physical device (not the JWT).
    device_id: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="App-generated device identifier"
    )

    platform: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="android",
        server_default="android",
        comment="android | ios",
    )

    app_version: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # jti (JWT id) of the token issued for this session, for optional revocation.
    token_jti: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )

    revoked: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        comment="When true, tokens for this session are rejected",
    )

    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    def __repr__(self) -> str:
        return f"<DeviceSession user={self.user_id} device={self.device_id}>"
