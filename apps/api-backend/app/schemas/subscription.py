"""Pydantic schemas for subscription state and RevenueCat webhooks."""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class SubscriptionResponse(BaseModel):
    """Current subscription state returned to the mobile app / admin."""

    plan_id: str
    status: str
    is_premium: bool
    entitlement: str
    store: Optional[str] = None
    product_id: Optional[str] = None
    will_renew: bool
    expires_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RevenueCatWebhookEvent(BaseModel):
    """
    Subset of the RevenueCat webhook `event` object we care about.

    RevenueCat posts `{"event": {...}, "api_version": "1.0"}`. We keep the raw
    payload too (stored on SubscriptionEvent.raw_payload) so nothing is lost.
    """

    id: str
    type: str
    app_user_id: Optional[str] = None
    original_app_user_id: Optional[str] = None
    product_id: Optional[str] = None
    entitlement_ids: Optional[list[str]] = None
    store: Optional[str] = None
    environment: Optional[str] = None
    event_timestamp_ms: Optional[int] = None
    expiration_at_ms: Optional[int] = None
    purchased_at_ms: Optional[int] = None


class RevenueCatWebhookPayload(BaseModel):
    event: RevenueCatWebhookEvent
    api_version: Optional[str] = None
