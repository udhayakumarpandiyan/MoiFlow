"""
User ORM model.

Stores the registered mobile users of the MoiFlow app.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class User(Base):
    """Registered MoiFlow app user."""

    __tablename__ = "users"

    # ------------------------------------------------------------------
    # Primary key
    # ------------------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    phone: Mapped[str] = mapped_column(
        String(10),
        unique=True,
        nullable=False,
        index=True,
        comment="10-digit Indian mobile number without country code",
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="User's full name as provided during registration",
    )

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
        comment="Soft-delete / ban flag",
    )

    is_verified: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        comment="True once the user completes OTP verification",
    )

    # ------------------------------------------------------------------
    # Timestamps
    # ------------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="UTC timestamp when the record was first created",
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        comment="UTC timestamp of the last update",
    )

    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="UTC timestamp of the most recent successful login",
    )

    # ------------------------------------------------------------------
    # Repr
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return f"<User id={self.id} phone=***{self.phone[-4:]} name={self.name!r}>"
