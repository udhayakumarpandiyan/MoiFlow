"""
Finance-domain cloud records.

Cloud mirrors of the mobile Finance tables (credits, loans, business
transactions). The mobile app owns the authoritative offline-first copy in
SQLite; these rows exist for premium multi-device sync and admin overview.

Deliberately NOT linked to any Moi table — the two domains stay decoupled at
the database level. Upsert by (user_id, client_id) makes sync idempotent.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class FinanceCredit(Base):
    """Cloud mirror of a Finance credit (IN/OUT money ledger entry)."""

    __tablename__ = "finance_credits"
    __table_args__ = (
        UniqueConstraint("user_id", "client_id", name="uq_fin_credits_user_client"),
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

    direction: Mapped[str] = mapped_column(
        String(3), nullable=False, comment="IN | OUT"
    )
    amount: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, default=0, server_default="0"
    )
    interest_rate: Mapped[float] = mapped_column(
        Numeric(6, 2), nullable=False, default=0, server_default="0"
    )
    person: Mapped[str | None] = mapped_column(String(200), nullable=True)
    village: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="UPCOMING", server_default="UPCOMING"
    )
    txn_date: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
        onupdate=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class FinanceLoan(Base):
    """Cloud mirror of a Finance EMI loan."""

    __tablename__ = "finance_loans"
    __table_args__ = (
        UniqueConstraint("user_id", "client_id", name="uq_fin_loans_user_client"),
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

    loan_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PERSONAL", server_default="PERSONAL"
    )
    loan_amount: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, default=0, server_default="0"
    )
    provider: Mapped[str | None] = mapped_column(String(200), nullable=True)
    interest_rate: Mapped[float] = mapped_column(
        Numeric(6, 2), nullable=False, default=0, server_default="0"
    )
    monthly_emi: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, default=0, server_default="0"
    )
    total_emis: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    paid_emis: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ACTIVE", server_default="ACTIVE"
    )
    start_date: Mapped[str | None] = mapped_column(String(40), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
        onupdate=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class FinanceBusinessTxn(Base):
    """Cloud mirror of a Finance business transaction (sale/purchase)."""

    __tablename__ = "finance_business_txns"
    __table_args__ = (
        UniqueConstraint("user_id", "client_id", name="uq_fin_biztxn_user_client"),
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

    kind: Mapped[str] = mapped_column(
        String(10), nullable=False, default="SALE", server_default="SALE",
        comment="SALE | PURCHASE",
    )
    party_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, default=0, server_default="0"
    )
    amount_settled: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, default=0, server_default="0"
    )
    txn_date: Mapped[str | None] = mapped_column(String(40), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
        onupdate=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
