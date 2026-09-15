"""
Admin user ORM model.

Admins are separate from mobile users. They authenticate with email + password
(bcrypt-hashed) and carry a role for role-based authorization in the admin API.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AdminUser(Base):
    """A back-office administrator account."""

    __tablename__ = "admin_users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    email: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False, default="Admin")

    password_hash: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="bcrypt hash — never store plaintext"
    )

    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="admin",
        server_default="admin",
        comment="superadmin | admin | viewer",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<AdminUser email={self.email} role={self.role}>"
