"""
OTP request ORM model.

An audit/history record of every OTP send attempt. The live OTP value itself
lives in the OTP store (memory/Redis) and is never persisted here — this table
only records that a request happened, for rate-limit analytics, abuse
detection, and admin activity monitoring.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class OTPRequest(Base):
    """History of an OTP send/verify attempt."""

    __tablename__ = "otp_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    phone: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        index=True,
        comment="10-digit Indian mobile number the OTP was sent to",
    )

    purpose: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="login",
        server_default="login",
        comment="login | register | reauth",
    )

    channel: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="sms",
        server_default="sms",
        comment="Delivery channel used (sms provider name or 'console')",
    )

    delivered: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        comment="Whether the provider accepted the send request",
    )

    verified: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        comment="Whether this OTP was subsequently verified successfully",
    )

    ip_address: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="Client IP that requested the OTP"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    def __repr__(self) -> str:
        return f"<OTPRequest phone=***{self.phone[-4:]} purpose={self.purpose}>"
