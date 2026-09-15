"""
Moi-domain cloud records.

Cloud mirrors of the two core Moi tables (events + entries). The mobile app
owns the authoritative offline-first copy in SQLite; these rows exist so
premium users can sync across devices and admins can see aggregate Moi data.

The mobile `id` (a client-generated string UUID) is stored as the natural key
so sync is idempotent (upsert by user_id + client_id).
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class MoiEvent(Base):
    """Cloud mirror of a Moi event."""

    __tablename__ = "moi_events"
    __table_args__ = (
        UniqueConstraint("user_id", "client_id", name="uq_moi_events_user_client"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[str] = mapped_column(
        String(64), nullable=False, comment="Mobile SQLite row id"
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    event_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    event_date: Mapped[str | None] = mapped_column(String(40), nullable=True)
    village_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class MoiEntry(Base):
    """Cloud mirror of a Moi entry (IN/OUT gift transaction)."""

    __tablename__ = "moi_entries"
    __table_args__ = (
        UniqueConstraint("user_id", "client_id", name="uq_moi_entries_user_client"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[str] = mapped_column(String(64), nullable=False)

    event_client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    direction: Mapped[str] = mapped_column(
        String(3), nullable=False, comment="IN | OUT"
    )
    person_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    village_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    amount: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, default=0, server_default="0"
    )
    gift_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    entry_date: Mapped[str | None] = mapped_column(String(40), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
