"""
User repository — all database operations for the User model.

Keeps SQL/ORM logic out of the API layer.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.user import User


class UserRepository:
    """Async repository for User CRUD operations."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    async def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        """Return a user by primary key, or None."""
        result = await self._db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_phone(self, phone: str) -> Optional[User]:
        """Return a user by their phone number, or None."""
        result = await self._db.execute(
            select(User).where(User.phone == phone)
        )
        return result.scalar_one_or_none()

    async def exists_by_phone(self, phone: str) -> bool:
        """True if any user record has this phone number."""
        result = await self._db.execute(
            select(User.id).where(User.phone == phone).limit(1)
        )
        return result.scalar_one_or_none() is not None

    # ------------------------------------------------------------------
    # Mutations
    # ------------------------------------------------------------------

    async def create(self, phone: str, name: str) -> User:
        """
        Insert a new unverified user.

        Call ``verify`` after successful OTP verification.
        """
        user = User(
            phone=phone,
            name=name,
            is_verified=False,
            is_active=True,
        )
        self._db.add(user)
        await self._db.flush()   # get auto-generated id without committing
        return user

    async def verify(self, user: User) -> User:
        """
        Mark a user as OTP-verified and record login time.

        Called after successful OTP verification.
        """
        now = datetime.now(timezone.utc)
        user.is_verified = True
        user.last_login_at = now
        self._db.add(user)
        await self._db.flush()
        return user

    async def record_login(self, user: User) -> User:
        """Update last_login_at for an existing verified user."""
        user.last_login_at = datetime.now(timezone.utc)
        self._db.add(user)
        await self._db.flush()
        return user

    async def update_name(self, user: User, name: str) -> User:
        """Update the display name of a user."""
        user.name = name
        self._db.add(user)
        await self._db.flush()
        return user

    async def deactivate(self, user: User) -> User:
        """Soft-delete a user by setting is_active=False."""
        user.is_active = False
        self._db.add(user)
        await self._db.flush()
        return user
