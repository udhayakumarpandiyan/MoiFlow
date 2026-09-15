"""
Subscription service.

Applies RevenueCat webhook events to derive a user's subscription state.
RevenueCat is the source of truth; this service only translates its events
into our `Subscription` row and keeps an append-only `SubscriptionEvent` log.

Payment logic is never performed here — we only react to events.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.core import plans
from app.db.models.subscription import Subscription, SubscriptionEvent
from app.repositories.subscription_repository import SubscriptionRepository
from app.schemas.subscription import RevenueCatWebhookEvent


# Event types that mean the user currently has (or regained) access.
_ACTIVE_EVENTS = {
    "INITIAL_PURCHASE",
    "RENEWAL",
    "PRODUCT_CHANGE",
    "UNCANCELLATION",
    "NON_RENEWING_PURCHASE",
}
# Event types that mean access should end (now or at period end).
_INACTIVE_EVENTS = {"EXPIRATION"}
_CANCEL_EVENTS = {"CANCELLATION"}


def _ms_to_dt(ms: Optional[int]) -> Optional[datetime]:
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


class SubscriptionService:
    def __init__(self, repo: SubscriptionRepository) -> None:
        self._repo = repo

    async def get_state(self, user_id: uuid.UUID) -> Subscription:
        """Return the user's subscription row (creating a free default if absent)."""
        return await self._repo.get_or_create_for_user(user_id)

    async def apply_webhook_event(
        self, event: RevenueCatWebhookEvent, raw_payload: dict
    ) -> bool:
        """
        Apply a single RevenueCat event.

        Returns True if applied, False if it was a duplicate (already seen).
        Idempotent via the unique event_id on SubscriptionEvent.
        """
        # Dedupe redelivered webhooks.
        if await self._repo.event_exists(event.id):
            return False

        # Resolve which MoiFlow user this maps to (app_user_id == user UUID).
        user_id: Optional[uuid.UUID] = None
        if event.app_user_id:
            try:
                user_id = uuid.UUID(event.app_user_id)
            except (ValueError, TypeError):
                user_id = None
            if user_id is None:
                customer = await self._repo.get_customer_by_app_user_id(
                    event.app_user_id
                )
                if customer is not None:
                    user_id = customer.user_id

        entitlement = ""
        if event.entitlement_ids:
            # Take the first premium entitlement present, else the first id.
            for ent in event.entitlement_ids:
                if plans.is_premium_entitlement(ent):
                    entitlement = ent
                    break
            else:
                entitlement = event.entitlement_ids[0]

        # Record the raw event (audit / replay), even if we can't map a user.
        await self._repo.add_event(
            SubscriptionEvent(
                event_id=event.id,
                user_id=user_id,
                app_user_id=event.app_user_id,
                event_type=event.type,
                product_id=event.product_id,
                entitlement=entitlement or None,
                store=event.store,
                environment=event.environment,
                event_timestamp=_ms_to_dt(event.event_timestamp_ms),
                raw_payload=raw_payload,
            )
        )

        if user_id is None:
            # Unmappable event is logged but changes no state.
            return True

        sub = await self._repo.get_or_create_for_user(user_id)

        event_dt = _ms_to_dt(event.event_timestamp_ms)
        # Ignore stale/out-of-order events.
        if sub.last_event_at and event_dt and event_dt < sub.last_event_at:
            return True

        plan = plans.plan_for_product(event.product_id or "")
        expires_at = _ms_to_dt(event.expiration_at_ms)

        if event.type in _ACTIVE_EVENTS:
            sub.is_premium = plans.is_premium_entitlement(entitlement) or bool(entitlement)
            sub.status = "active"
            sub.will_renew = event.type != "NON_RENEWING_PURCHASE"
            sub.plan_id = plan.id if plan else sub.plan_id
            sub.entitlement = entitlement or plans.PREMIUM_ENTITLEMENT
            sub.product_id = event.product_id
            sub.store = event.store
            sub.current_period_start = _ms_to_dt(event.purchased_at_ms) or sub.current_period_start
            sub.expires_at = expires_at
        elif event.type in _CANCEL_EVENTS:
            # Cancelled but may still have access until expiry.
            sub.status = "cancelled"
            sub.will_renew = False
            sub.expires_at = expires_at or sub.expires_at
        elif event.type in _INACTIVE_EVENTS:
            sub.is_premium = False
            sub.status = "expired"
            sub.will_renew = False
            sub.plan_id = "free"
            sub.entitlement = ""
            sub.expires_at = expires_at or sub.expires_at

        if event_dt:
            sub.last_event_at = event_dt

        return True
