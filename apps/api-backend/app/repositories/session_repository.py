"""
Device session repository.

Records authenticated devices/sessions for a user. Used for the "active
devices" view, login audit, and optional server-side token revocation.
"""

import uuid
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.device_session import DeviceSession


class SessionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def upsert_on_login(
        self,
        *,
        user_id: uuid.UUID,
        device_id: str,
        platform: str = "android",
        app_version: str | None = None,
        token_jti: str | None = None,
        ip_address: str | None = None,
    ) -> DeviceSession:
        """Create or refresh the session row for (user, device)."""
        result = await self._db.execute(
            select(DeviceSession).where(
                DeviceSession.user_id == user_id,
                DeviceSession.device_id == device_id,
            )
        )
        session = result.scalar_one_or_none()
        if session is None:
            session = DeviceSession(
                user_id=user_id,
                device_id=device_id,
                platform=platform,
                app_version=app_version,
                token_jti=token_jti,
                ip_address=ip_address,
                revoked=False,
            )
            self._db.add(session)
        else:
            session.platform = platform
            session.app_version = app_version
            session.token_jti = token_jti
            session.ip_address = ip_address
            session.revoked = False
        await self._db.flush()
        return session

    async def list_for_user(
        self, user_id: uuid.UUID
    ) -> Sequence[DeviceSession]:
        result = await self._db.execute(
            select(DeviceSession)
            .where(DeviceSession.user_id == user_id)
            .order_by(DeviceSession.last_seen_at.desc())
        )
        return result.scalars().all()

    async def is_jti_revoked(self, token_jti: str) -> bool:
        result = await self._db.execute(
            select(DeviceSession.revoked).where(
                DeviceSession.token_jti == token_jti
            )
        )
        row = result.scalar_one_or_none()
        return bool(row) if row is not None else False
