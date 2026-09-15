"""
ORM model registry.

Importing every model here ensures they are all registered on `Base.metadata`
so Alembic autogenerate and `create_tables()` see the full schema. Moi and
Finance models live in separate subpackages and stay decoupled.
"""

from app.db.models.user import User
from app.db.models.otp_request import OTPRequest
from app.db.models.device_session import DeviceSession
from app.db.models.subscription import (
    RevenueCatCustomer,
    Subscription,
    SubscriptionEvent,
)
from app.db.models.admin_user import AdminUser
from app.db.models.audit_log import AuditLog
from app.db.models.ai_usage import AIUsage

# Domain-separated cloud models
from app.db.models.moi import MoiEvent, MoiEntry
from app.db.models.finance import FinanceCredit, FinanceLoan, FinanceBusinessTxn

__all__ = [
    "User",
    "OTPRequest",
    "DeviceSession",
    "RevenueCatCustomer",
    "Subscription",
    "SubscriptionEvent",
    "AdminUser",
    "AuditLog",
    "AIUsage",
    "MoiEvent",
    "MoiEntry",
    "FinanceCredit",
    "FinanceLoan",
    "FinanceBusinessTxn",
]
