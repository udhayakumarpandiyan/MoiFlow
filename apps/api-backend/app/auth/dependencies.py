"""
Reusable FastAPI auth dependencies.

`get_current_user` authenticates a mobile user from the Bearer JWT and loads
the User row. `get_current_admin` does the same for admin JWTs and enforces an
active admin account. `require_role` builds a dependency that additionally
checks the admin's role for role-based authorization.
"""

import uuid
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models.user import User
from app.db.models.admin_user import AdminUser
from app.repositories.user_repository import UserRepository
from app.repositories.admin_repository import AdminRepository
from app.services.token_service import verify_access_token


def _bearer(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token required.",
        )
    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header.",
        )
    return parts[1]


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate a mobile user from the Bearer access token."""
    payload = verify_access_token(_bearer(authorization))
    if payload is None or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired or invalid.",
        )

    sub = payload.get("sub")
    try:
        user_id = uuid.UUID(str(sub))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject.",
        )

    user = await UserRepository(db).get_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated.",
        )
    return user


async def get_current_admin(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    """Authenticate an admin from the Bearer access token (token type 'admin')."""
    payload = verify_access_token(_bearer(authorization))
    if payload is None or payload.get("type") != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required.",
        )

    sub = payload.get("sub")
    try:
        admin_id = uuid.UUID(str(sub))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token.",
        )

    admin = await AdminRepository(db).get_by_id(admin_id)
    if admin is None or not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin not found or deactivated.",
        )
    return admin


def require_role(*allowed_roles: str):
    """
    Build a dependency that enforces the admin has one of `allowed_roles`.
    'superadmin' always passes.
    """

    async def _checker(admin: AdminUser = Depends(get_current_admin)) -> AdminUser:
        if admin.role != "superadmin" and admin.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions.",
            )
        return admin

    return _checker
