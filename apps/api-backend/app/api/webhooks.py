"""
Webhook endpoints.

    POST /api/webhooks/revenuecat
        Receives RevenueCat subscription events. Authenticated via the shared
        Authorization secret configured in the RevenueCat dashboard. The event
        is logged (append-only, idempotent by event id) and the user's
        subscription state is updated. RevenueCat remains the source of truth.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.integrations.revenuecat import verify_webhook_auth
from app.repositories.subscription_repository import SubscriptionRepository
from app.schemas.subscription import RevenueCatWebhookPayload
from app.services.subscription_service import SubscriptionService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/revenuecat")
async def revenuecat_webhook(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    # 1) Authenticate the webhook.
    if not verify_webhook_auth(authorization):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook authorization.",
        )

    # 2) Parse the raw body (kept for the append-only audit log).
    raw = await request.json()
    try:
        payload = RevenueCatWebhookPayload.model_validate(raw)
    except Exception as exc:  # malformed payload
        logger.warning("Malformed RevenueCat webhook: %s", exc)
        raise HTTPException(status_code=422, detail="Malformed webhook payload.")

    # 3) Apply idempotently.
    service = SubscriptionService(SubscriptionRepository(db))
    applied = await service.apply_webhook_event(payload.event, raw)

    # Always 200 so RevenueCat does not retry a duplicate forever.
    return {"received": True, "applied": applied}
