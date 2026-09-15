"""
Subscription repository — DB operations for subscription state and events.
"""

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.subscription import (
    RevenueCatCustomer,
    Subscription,
    SubscriptionEvent,
)


class SubscriptionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ---- Subscription state --------------------------------------------

    async def get_for_user(self, user_id: uuid.UUID) -> Optional[Subscription]:
        result = await self._db.execute(
            select(Subscription).where(Subscription.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create_for_user(self, user_id: uuid.UUID) -> Subscription:
        sub = await self.get_for_user(user_id)
        if sub is None:
            sub = Subscription(user_id=user_id, plan_id="free", status="none")
            self._db.add(sub)
            await self._db.flush()
        return sub

    # ---- RevenueCat customer mapping -----------------------------------

    async def get_customer_by_app_user_id(
        self, app_user_id: str
    ) -> Optional[RevenueCatCustomer]:
        result = await self._db.execute(
            select(RevenueCatCustomer).where(
                RevenueCatCustomer.app_user_id == app_user_id
            )
        )
        return result.scalar_one_or_none()

    async def upsert_customer(
        self, user_id: uuid.UUID, app_user_id: str, original_app_user_id: str | None
    ) -> RevenueCatCustomer:
        result = await self._db.execute(
            select(RevenueCatCustomer).where(
                RevenueCatCustomer.user_id == user_id
            )
        )
        customer = result.scalar_one_or_none()
        if customer is None:
            customer = RevenueCatCustomer(
                user_id=user_id,
                app_user_id=app_user_id,
                original_app_user_id=original_app_user_id,
            )
            self._db.add(customer)
        else:
            customer.app_user_id = app_user_id
            customer.original_app_user_id = original_app_user_id
        await self._db.flush()
        return customer

    # ---- Events --------------------------------------------------------

    async def event_exists(self, event_id: str) -> bool:
        result = await self._db.execute(
            select(SubscriptionEvent.id)
            .where(SubscriptionEvent.event_id == event_id)
            .limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def add_event(self, event: SubscriptionEvent) -> SubscriptionEvent:
        self._db.add(event)
        await self._db.flush()
        return event
