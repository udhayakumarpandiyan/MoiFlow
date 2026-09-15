"""
Subscription ORM models.

RevenueCat is the source of truth for subscription state. These tables mirror
what RevenueCat tells us via webhooks so the backend and admin portal can query
subscription status without calling RevenueCat on every request.

  - RevenueCatCustomer: maps a MoiFlow user to a RevenueCat app_user_id.
  - Subscription:       the user's current derived subscription state.
  - SubscriptionEvent:  append-only log of every RevenueCat webhook event.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class RevenueCatCustomer(Base):
    """Links a MoiFlow user to their RevenueCat app_user_id."""

    __tablename__ = "revenuecat_customers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    app_user_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        unique=True,
        index=True,
        comment="RevenueCat app_user_id (we use the MoiFlow user UUID)",
    )

    original_app_user_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class Subscription(Base):
    """
    Current subscription state for a user, derived from RevenueCat events.

    One row per user. `is_premium` is the flag the app/limits check.
    """

    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    plan_id: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="free",
        server_default="free",
        comment="One of the configured plan ids (free/monthly/...)",
    )

    entitlement: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="",
        server_default="",
        comment="RevenueCat entitlement id currently active ('' if none)",
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="none",
        server_default="none",
        comment="active | expired | in_grace_period | cancelled | none",
    )

    is_premium: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        index=True,
    )

    store: Mapped[str | None] = mapped_column(
        String(30), nullable=True, comment="play_store | app_store | promotional"
    )

    product_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    will_renew: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    current_period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Monotonic guard: ignore webhook events older than the last applied one.
    last_event_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SubscriptionEvent(Base):
    """Append-only log of RevenueCat webhook events (idempotent by event id)."""

    __tablename__ = "subscription_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # RevenueCat's own event id — unique so we can dedupe redelivered webhooks.
    event_id: Mapped[str] = mapped_column(
        String(128), nullable=False, unique=True, index=True
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    app_user_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="INITIAL_PURCHASE | RENEWAL | CANCELLATION | EXPIRATION | ...",
    )

    product_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    entitlement: Mapped[str | None] = mapped_column(String(50), nullable=True)
    store: Mapped[str | None] = mapped_column(String(30), nullable=True)

    environment: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="SANDBOX | PRODUCTION"
    )

    event_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Full raw payload for audit / replay.
    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
