"""
Admin repository — database operations for AdminUser.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.admin_user import AdminUser


class AdminRepository:
    """Async repository for admin accounts."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, admin_id: uuid.UUID) -> Optional[AdminUser]:
        result = await self._db.execute(
            select(AdminUser).where(AdminUser.id == admin_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[AdminUser]:
        result = await self._db.execute(
            select(AdminUser).where(AdminUser.email == email.lower())
        )
        return result.scalar_one_or_none()

    async def create(
        self, email: str, name: str, password_hash: str, role: str = "admin"
    ) -> AdminUser:
        admin = AdminUser(
            email=email.lower(),
            name=name,
            password_hash=password_hash,
            role=role,
        )
        self._db.add(admin)
        await self._db.flush()
        return admin

    async def record_login(self, admin: AdminUser) -> AdminUser:
        admin.last_login_at = datetime.now(timezone.utc)
        self._db.add(admin)
        await self._db.flush()
        return admin
