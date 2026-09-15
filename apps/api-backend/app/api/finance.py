"""
Finance API — cloud sync for the Finance domain (credits, loans, business).

Mirror of the Moi sync API but for the Finance domain, kept in a separate
module so the two domains stay decoupled. All endpoints require an
authenticated premium user; SQLite remains authoritative offline.

    POST /api/finance/credits/push  GET /api/finance/credits/pull
    POST /api/finance/loans/push    GET /api/finance/loans/pull
    POST /api/finance/business/push GET /api/finance/business/pull
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models.user import User
from app.repositories.finance_sync_repository import FinanceSyncRepository
from app.repositories.subscription_repository import SubscriptionRepository
from app.schemas.sync import SyncPullResponse, SyncPushRequest, SyncPushResponse

router = APIRouter()


async def _require_premium(user: User, db: AsyncSession) -> None:
    sub = await SubscriptionRepository(db).get_for_user(user.id)
    if sub is None or not sub.is_premium:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Cloud sync requires an active premium subscription.",
        )


# -- Credits ----------------------------------------------------------------

@router.post("/credits/push", response_model=SyncPushResponse)
async def push_credits(
    request: SyncPushRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_premium(user, db)
    up, skip = await FinanceSyncRepository(db).upsert_credits(user.id, request.records)
    return SyncPushResponse(upserted=up, skipped=skip)


@router.get("/credits/pull", response_model=SyncPullResponse)
async def pull_credits(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_premium(user, db)
    return SyncPullResponse(records=await FinanceSyncRepository(db).get_credits(user.id))


# -- Loans ------------------------------------------------------------------

@router.post("/loans/push", response_model=SyncPushResponse)
async def push_loans(
    request: SyncPushRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_premium(user, db)
    up, skip = await FinanceSyncRepository(db).upsert_loans(user.id, request.records)
    return SyncPushResponse(upserted=up, skipped=skip)


@router.get("/loans/pull", response_model=SyncPullResponse)
async def pull_loans(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_premium(user, db)
    return SyncPullResponse(records=await FinanceSyncRepository(db).get_loans(user.id))


# -- Business ---------------------------------------------------------------

@router.post("/business/push", response_model=SyncPushResponse)
async def push_business(
    request: SyncPushRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_premium(user, db)
    up, skip = await FinanceSyncRepository(db).upsert_business(user.id, request.records)
    return SyncPushResponse(upserted=up, skipped=skip)


@router.get("/business/pull", response_model=SyncPullResponse)
async def pull_business(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_premium(user, db)
    return SyncPullResponse(records=await FinanceSyncRepository(db).get_business(user.id))
