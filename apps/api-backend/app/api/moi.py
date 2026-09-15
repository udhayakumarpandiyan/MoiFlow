"""
Moi API — cloud sync for the Moi domain (events, entries).

All endpoints require an authenticated user. Cloud sync is a premium feature
(multi-device), so a non-premium user gets 402. The mobile app's SQLite
remains authoritative offline; these endpoints just mirror data to the cloud
and let another device pull it back.

    POST /api/moi/events/push     — upsert events into the cloud mirror
    GET  /api/moi/events/pull     — fetch the user's cloud events
    POST /api/moi/entries/push    — upsert entries into the cloud mirror
    GET  /api/moi/entries/pull    — fetch the user's cloud entries
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models.user import User
from app.repositories.moi_sync_repository import MoiSyncRepository
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


@router.post("/events/push", response_model=SyncPushResponse)
async def push_events(
    request: SyncPushRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_premium(user, db)
    up, skip = await MoiSyncRepository(db).upsert_events(user.id, request.records)
    return SyncPushResponse(upserted=up, skipped=skip)


@router.get("/events/pull", response_model=SyncPullResponse)
async def pull_events(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_premium(user, db)
    return SyncPullResponse(records=await MoiSyncRepository(db).get_events(user.id))


@router.post("/entries/push", response_model=SyncPushResponse)
async def push_entries(
    request: SyncPushRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_premium(user, db)
    up, skip = await MoiSyncRepository(db).upsert_entries(user.id, request.records)
    return SyncPushResponse(upserted=up, skipped=skip)


@router.get("/entries/pull", response_model=SyncPullResponse)
async def pull_entries(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_premium(user, db)
    return SyncPullResponse(records=await MoiSyncRepository(db).get_entries(user.id))
