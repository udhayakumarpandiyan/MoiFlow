"""
Subscription plan catalogue (backend source of truth for entitlements).

Kept configurable so plans can change without touching business logic. The
mobile app and admin portal read the same plan ids/prices from the shared TS
constants (`shared/constants`); these must be kept in sync.

RevenueCat remains the source of truth for a user's *current* subscription
state. This module only describes what plans exist and what entitlement they
grant, so the rest of the backend can map a RevenueCat product/entitlement to
a known plan.
"""

from __future__ import annotations

from dataclasses import dataclass


PREMIUM_ENTITLEMENT = "premium"


@dataclass(frozen=True)
class Plan:
    """A configurable subscription plan."""

    id: str
    label: str
    price_inr: int
    duration_months: int
    entitlement: str  # "" for free
    play_product_id: str  # "" for free


# Order matters for display (free first, then cheapest -> most expensive).
PLANS: tuple[Plan, ...] = (
    Plan("free", "Free", 0, 0, "", ""),
    Plan("monthly", "₹29 / month", 29, 1, PREMIUM_ENTITLEMENT, "moiflow_monthly"),
    Plan("quarterly", "₹79 / 3 months", 79, 3, PREMIUM_ENTITLEMENT, "moiflow_quarterly"),
    Plan("half_yearly", "₹149 / 6 months", 149, 6, PREMIUM_ENTITLEMENT, "moiflow_half_yearly"),
    Plan("yearly", "₹289 / year", 289, 12, PREMIUM_ENTITLEMENT, "moiflow_yearly"),
)

_PLANS_BY_ID = {p.id: p for p in PLANS}
_PLANS_BY_PRODUCT = {p.play_product_id: p for p in PLANS if p.play_product_id}


def get_plan(plan_id: str) -> Plan | None:
    """Look up a plan by its id."""
    return _PLANS_BY_ID.get(plan_id)


def plan_for_product(product_id: str) -> Plan | None:
    """Map a store product id (from RevenueCat) to a known plan."""
    return _PLANS_BY_PRODUCT.get(product_id)


def is_premium_entitlement(entitlement_id: str) -> bool:
    """Whether an entitlement id grants premium access."""
    return entitlement_id == PREMIUM_ENTITLEMENT
