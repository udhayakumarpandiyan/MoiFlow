"""
Subscription API (mobile-facing).

    GET  /api/subscriptions/me
        Return the authenticated user's current subscription state.

    POST /api/subscriptions/link
        Associate the user's RevenueCat app_user_id (idempotent).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models.user import User
from app.repositories.subscription_repository import SubscriptionRepository
from app.schemas.subscription import SubscriptionResponse
from app.services.subscription_service import SubscriptionService

router = APIRouter()


@router.get("/me", response_model=SubscriptionResponse)
async def my_subscription(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SubscriptionService(SubscriptionRepository(db))
    sub = await service.get_state(user.id)
    return SubscriptionResponse.model_validate(sub)


class LinkCustomerRequest(BaseModel):
    app_user_id: str
    original_app_user_id: str | None = None


@router.post("/link", response_model=SubscriptionResponse)
async def link_customer(
    request: LinkCustomerRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = SubscriptionRepository(db)
    await repo.upsert_customer(
        user_id=user.id,
        app_user_id=request.app_user_id,
        original_app_user_id=request.original_app_user_id,
    )
    sub = await repo.get_or_create_for_user(user.id)
    return SubscriptionResponse.model_validate(sub)
