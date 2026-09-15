"""
Audit log ORM model.

Append-only record of security-relevant actions: admin logins, admin data
access, config changes, subscription overrides, user deactivations, etc.
Written via the audit service; never mutated or deleted through the app.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AuditLog(Base):
    """A single audited action."""

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Who performed the action.
    actor_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="admin | user | system",
    )
    actor_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="admin/user id when applicable"
    )

    action: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
        index=True,
        comment="e.g. admin.login, user.deactivate, config.update",
    )

    # What was acted on.
    target_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Arbitrary structured detail (before/after, reason, etc.).
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    def __repr__(self) -> str:
        return f"<AuditLog action={self.action} actor={self.actor_type}:{self.actor_id}>"
