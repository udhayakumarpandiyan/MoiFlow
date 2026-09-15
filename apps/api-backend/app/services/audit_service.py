"""
Audit service — writes append-only audit log entries.

Kept tiny and dependency-light so any endpoint/service can record a
security-relevant action.
"""

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_log import AuditLog


async def record_audit(
    db: AsyncSession,
    *,
    actor_type: str,
    action: str,
    actor_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    detail: Optional[dict[str, Any]] = None,
) -> None:
    """Insert an audit log row. Flushes but does not commit (caller's session
    commit handles that via get_db)."""
    db.add(
        AuditLog(
            actor_type=actor_type,
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            ip_address=ip_address,
            detail=detail,
        )
    )
    await db.flush()
