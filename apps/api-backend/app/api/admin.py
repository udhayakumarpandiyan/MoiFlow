"""
Admin API.

All endpoints except login require an admin JWT (get_current_admin). Read
endpoints allow any active admin; destructive/config endpoints require the
'admin' or 'superadmin' role via require_role. The admin portal talks ONLY to
these endpoints — never directly to PostgreSQL.

    POST /api/admin/auth/login       — email+password -> admin JWT
    GET  /api/admin/me               — current admin profile
    GET  /api/admin/dashboard        — high-level metrics
    GET  /api/admin/users            — user list (paginated)
    GET  /api/admin/subscriptions    — subscription list
    GET  /api/admin/moi/overview     — Moi data counts
    GET  /api/admin/finance/overview — Finance data counts
    GET  /api/admin/ai/usage         — AI usage metrics
    GET  /api/admin/otp/activity     — recent OTP activity
    GET  /api/admin/audit            — audit log
    GET  /api/admin/config           — non-secret system config
    POST /api/admin/users/{id}/deactivate — deactivate a user (admin role)
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_admin, require_role
from app.core import plans
from app.core.config import (
    AI_PROVIDER,
    ENVIRONMENT,
    OTP_EXPIRY_SECONDS,
    OTP_MAX_SEND_PER_HOUR,
    SMS_PROVIDER,
)
from app.db.database import get_db
from app.auth.security import hash_password
from app.db.models.admin_user import AdminUser
from app.repositories.admin_metrics_repository import AdminMetricsRepository
from app.repositories.admin_repository import AdminRepository
from app.repositories.user_repository import UserRepository
from app.schemas.admin import (
    AdminLoginRequest,
    AdminLoginResponse,
    AdminProfile,
    AdminUserSummary,
    CreateAdminRequest,
    SystemConfigResponse,
    UpdateAdminRequest,
    VALID_ADMIN_ROLES,
)
from app.services.admin_service import authenticate_admin
from app.services.audit_service import record_audit
from app.services.token_service import create_admin_token


def _admin_summary(a: AdminUser) -> AdminUserSummary:
    return AdminUserSummary(
        id=str(a.id),
        email=a.email,
        name=a.name,
        role=a.role,
        is_active=a.is_active,
        created_at=a.created_at.isoformat(),
        last_login_at=a.last_login_at.isoformat() if a.last_login_at else None,
    )

router = APIRouter()


def _client_ip(request: Request) -> str | None:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@router.post("/auth/login", response_model=AdminLoginResponse)
async def admin_login(
    request: AdminLoginRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    admin = await authenticate_admin(db, str(request.email), request.password)
    if admin is None:
        # Audit the failed attempt (no actor id — unauthenticated).
        await record_audit(
            db,
            actor_type="admin",
            action="admin.login_failed",
            target_type="email",
            target_id=str(request.email),
            ip_address=_client_ip(http_request),
        )
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    token = create_admin_token(str(admin.id))
    await record_audit(
        db,
        actor_type="admin",
        actor_id=str(admin.id),
        action="admin.login",
        ip_address=_client_ip(http_request),
    )
    return AdminLoginResponse(token=token, name=admin.name, role=admin.role)


@router.get("/me", response_model=AdminProfile)
async def admin_me(admin: AdminUser = Depends(get_current_admin)):
    return AdminProfile(
        id=str(admin.id),
        email=admin.email,
        name=admin.name,
        role=admin.role,
        last_login_at=admin.last_login_at.isoformat() if admin.last_login_at else None,
    )


# ---------------------------------------------------------------------------
# Metrics / lists (any active admin)
# ---------------------------------------------------------------------------

@router.get("/dashboard")
async def dashboard(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    return await AdminMetricsRepository(db).dashboard()


@router.get("/users")
async def users(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await AdminMetricsRepository(db).list_users(limit, offset)


@router.get("/subscriptions")
async def subscriptions(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await AdminMetricsRepository(db).list_subscriptions(limit, offset)


@router.get("/moi/overview")
async def moi_overview(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    return await AdminMetricsRepository(db).moi_overview()


@router.get("/finance/overview")
async def finance_overview(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    return await AdminMetricsRepository(db).finance_overview()


@router.get("/ai/usage")
async def ai_usage(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await AdminMetricsRepository(db).ai_usage(limit, offset)


@router.get("/otp/activity")
async def otp_activity(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await AdminMetricsRepository(db).otp_activity(limit, offset)


@router.get("/audit")
async def audit(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await AdminMetricsRepository(db).recent_audit(limit, offset)


@router.get("/config", response_model=SystemConfigResponse)
async def system_config(admin: AdminUser = Depends(get_current_admin)):
    return SystemConfigResponse(
        environment=ENVIRONMENT,
        sms_provider=SMS_PROVIDER,
        ai_provider=AI_PROVIDER,
        otp_expiry_seconds=OTP_EXPIRY_SECONDS,
        otp_max_send_per_hour=OTP_MAX_SEND_PER_HOUR,
        plans=[
            {
                "id": p.id,
                "label": p.label,
                "price_inr": p.price_inr,
                "duration_months": p.duration_months,
            }
            for p in plans.PLANS
        ],
    )


# ---------------------------------------------------------------------------
# Admin-user management (superadmin only)
# ---------------------------------------------------------------------------

@router.get("/admins", response_model=list[AdminUserSummary])
async def list_admins(
    admin: AdminUser = Depends(require_role("superadmin")),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    admins = await AdminRepository(db).list_all(limit, offset)
    return [_admin_summary(a) for a in admins]


@router.post("/admins", response_model=AdminUserSummary, status_code=201)
async def create_admin(
    request: CreateAdminRequest,
    http_request: Request,
    admin: AdminUser = Depends(require_role("superadmin")),
    db: AsyncSession = Depends(get_db),
):
    role = request.role.lower()
    if role not in VALID_ADMIN_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Role must be one of: {', '.join(VALID_ADMIN_ROLES)}.",
        )

    repo = AdminRepository(db)
    if await repo.get_by_email(request.email) is not None:
        raise HTTPException(status_code=409, detail="An admin with that email already exists.")

    created = await repo.create(
        email=request.email,
        name=request.name.strip(),
        password_hash=hash_password(request.password),
        role=role,
    )
    await record_audit(
        db,
        actor_type="admin",
        actor_id=str(admin.id),
        action="admin.create",
        target_type="admin",
        target_id=str(created.id),
        ip_address=_client_ip(http_request),
        detail={"email": created.email, "role": created.role},
    )
    return _admin_summary(created)


@router.patch("/admins/{admin_id}", response_model=AdminUserSummary)
async def update_admin(
    admin_id: str,
    request: UpdateAdminRequest,
    http_request: Request,
    admin: AdminUser = Depends(require_role("superadmin")),
    db: AsyncSession = Depends(get_db),
):
    try:
        target_id = uuid.UUID(admin_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid admin id.")

    repo = AdminRepository(db)
    target = await repo.get_by_id(target_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Admin not found.")

    is_self = target.id == admin.id

    # Guard against self-lockout: a superadmin cannot deactivate or demote
    # their own account (that could leave the system with no superadmin).
    if is_self and request.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    if is_self and request.role is not None and request.role.lower() != "superadmin":
        raise HTTPException(status_code=400, detail="You cannot change your own role.")

    changed: dict = {}

    if request.name is not None:
        await repo.set_name(target, request.name.strip())
        changed["name"] = request.name.strip()

    if request.role is not None:
        role = request.role.lower()
        if role not in VALID_ADMIN_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"Role must be one of: {', '.join(VALID_ADMIN_ROLES)}.",
            )
        await repo.set_role(target, role)
        changed["role"] = role

    if request.is_active is not None:
        await repo.set_active(target, request.is_active)
        changed["is_active"] = request.is_active

    if request.password is not None:
        await repo.set_password(target, hash_password(request.password))
        changed["password"] = "updated"

    await db.flush()
    await record_audit(
        db,
        actor_type="admin",
        actor_id=str(admin.id),
        action="admin.update",
        target_type="admin",
        target_id=admin_id,
        ip_address=_client_ip(http_request),
        detail=changed,
    )
    # Re-read the fresh row for the response.
    refreshed = await repo.get_by_id(target_id)
    return _admin_summary(refreshed or target)


# ---------------------------------------------------------------------------
# Mutations (admin/superadmin role)
# ---------------------------------------------------------------------------

@router.post("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    http_request: Request,
    admin: AdminUser = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id.")

    repo = UserRepository(db)
    user = await repo.get_by_id(uid)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    await repo.deactivate(user)
    await record_audit(
        db,
        actor_type="admin",
        actor_id=str(admin.id),
        action="user.deactivate",
        target_type="user",
        target_id=user_id,
        ip_address=_client_ip(http_request),
    )
    return {"success": True}
