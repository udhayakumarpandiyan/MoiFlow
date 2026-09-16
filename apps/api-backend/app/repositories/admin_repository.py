"""
Admin repository — database operations for AdminUser.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Sequence

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

    async def list_all(
        self, limit: int = 100, offset: int = 0
    ) -> Sequence[AdminUser]:
        result = await self._db.execute(
            select(AdminUser)
            .order_by(AdminUser.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return result.scalars().all()

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

    async def set_name(self, admin: AdminUser, name: str) -> AdminUser:
        admin.name = name
        self._db.add(admin)
        await self._db.flush()
        return admin

    async def set_active(self, admin: AdminUser, is_active: bool) -> AdminUser:
        admin.is_active = is_active
        self._db.add(admin)
        await self._db.flush()
        return admin

    async def set_role(self, admin: AdminUser, role: str) -> AdminUser:
        admin.role = role
        self._db.add(admin)
        await self._db.flush()
        return admin

    async def set_password(self, admin: AdminUser, password_hash: str) -> AdminUser:
        admin.password_hash = password_hash
        self._db.add(admin)
        await self._db.flush()
        return admin

    async def count(self) -> int:
        from sqlalchemy import func

        result = await self._db.execute(select(func.count()).select_from(AdminUser))
        return int(result.scalar_one())
