"""
Admin service — authentication and bootstrap for back-office accounts.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_password, verify_password
from app.core.config import ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD
from app.db.database import AsyncSessionLocal
from app.db.models.admin_user import AdminUser
from app.repositories.admin_repository import AdminRepository

logger = logging.getLogger(__name__)


async def authenticate_admin(
    db: AsyncSession, email: str, password: str
) -> AdminUser | None:
    """Return the admin if credentials are valid and the account is active."""
    admin = await AdminRepository(db).get_by_email(email)
    if admin is None or not admin.is_active:
        return None
    if not verify_password(password, admin.password_hash):
        return None
    await AdminRepository(db).record_login(admin)
    return admin


async def bootstrap_admin() -> None:
    """
    Seed a bootstrap superadmin from env on startup if configured and none
    exists yet. Idempotent — never overwrites an existing account. This
    guarantees there is always a way into the admin portal without exposing a
    password in code.
    """
    if not ADMIN_BOOTSTRAP_EMAIL or not ADMIN_BOOTSTRAP_PASSWORD:
        return

    async with AsyncSessionLocal() as db:
        repo = AdminRepository(db)
        existing = await repo.get_by_email(ADMIN_BOOTSTRAP_EMAIL)
        if existing is not None:
            return
        await repo.create(
            email=ADMIN_BOOTSTRAP_EMAIL,
            name="Bootstrap Admin",
            password_hash=hash_password(ADMIN_BOOTSTRAP_PASSWORD),
            role="superadmin",
        )
        await db.commit()
        logger.info("Bootstrap superadmin created: %s", ADMIN_BOOTSTRAP_EMAIL)
