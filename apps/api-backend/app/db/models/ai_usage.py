"""
AI usage ORM model.

Records each call routed through the AI service layer (Sarvam or future
providers) so the admin portal can report AI usage and we can attribute cost.
No user content is stored here — only metadata.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AIUsage(Base):
    """One AI provider invocation."""

    __tablename__ = "ai_usage"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    provider: Mapped[str] = mapped_column(
        String(30), nullable=False, comment="sarvam | ..."
    )

    task: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="voice_parse | text_understand | summary | growth | suggestion | ...",
    )

    domain: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="moi | finance | common"
    )

    tokens_in: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    tokens_out: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    latency_ms: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    success: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
