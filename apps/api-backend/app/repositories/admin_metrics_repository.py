"""
Admin metrics repository.

Read-only aggregate queries that power the admin dashboard and list views.
All queries go through the FastAPI backend — the admin portal never touches
PostgreSQL directly.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.user import User
from app.db.models.subscription import Subscription, SubscriptionEvent
from app.db.models.otp_request import OTPRequest
from app.db.models.ai_usage import AIUsage
from app.db.models.audit_log import AuditLog
from app.db.models.moi import MoiEvent, MoiEntry
from app.db.models.finance import FinanceCredit, FinanceLoan, FinanceBusinessTxn
from app.core import plans


class AdminMetricsRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _count(self, model, *where) -> int:
        stmt = select(func.count()).select_from(model)
        for w in where:
            stmt = stmt.where(w)
        return int((await self._db.execute(stmt)).scalar_one())

    async def dashboard(self) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        total_users = await self._count(User)
        new_users_7d = await self._count(User, User.created_at >= week_ago)
        new_users_30d = await self._count(User, User.created_at >= month_ago)
        # "Active" = logged in within the last 7 days.
        active_users_7d = await self._count(
            User, User.last_login_at.is_not(None), User.last_login_at >= week_ago
        )
        premium_users = await self._count(
            Subscription, Subscription.is_premium.is_(True)
        )
        free_users = max(total_users - premium_users, 0)

        # Subscription distribution by plan.
        dist_rows = (
            await self._db.execute(
                select(Subscription.plan_id, func.count())
                .group_by(Subscription.plan_id)
            )
        ).all()
        distribution = {row[0]: int(row[1]) for row in dist_rows}
        # Ensure free reflects users without a subscription row too.
        distribution.setdefault("free", 0)

        # Estimated MRR-ish revenue from active premium subs by plan price.
        revenue = 0
        for plan_id, count in distribution.items():
            plan = plans.get_plan(plan_id)
            if plan and plan.price_inr:
                # Only count active-premium subscribers for this plan.
                active_for_plan = await self._count(
                    Subscription,
                    Subscription.plan_id == plan_id,
                    Subscription.is_premium.is_(True),
                )
                revenue += plan.price_inr * active_for_plan

        ai_calls_total = await self._count(AIUsage)
        ai_calls_30d = await self._count(AIUsage, AIUsage.created_at >= month_ago)
        otp_24h = await self._count(OTPRequest, OTPRequest.created_at >= day_ago)

        recent_activity = await self.recent_audit(limit=10)

        return {
            "users": {
                "total": total_users,
                "active_7d": active_users_7d,
                "new_7d": new_users_7d,
                "new_30d": new_users_30d,
                "free": free_users,
                "premium": premium_users,
            },
            "subscriptions": {
                "premium": premium_users,
                "distribution": distribution,
                "estimated_revenue_inr": revenue,
            },
            "ai": {"total_calls": ai_calls_total, "calls_30d": ai_calls_30d},
            "otp": {"requests_24h": otp_24h},
            "recent_activity": recent_activity,
        }

    async def list_users(self, limit: int = 50, offset: int = 0) -> list[dict]:
        rows = (
            await self._db.execute(
                select(User, Subscription)
                .join(Subscription, Subscription.user_id == User.id, isouter=True)
                .order_by(User.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
        result = []
        for user, sub in rows:
            result.append(
                {
                    "id": str(user.id),
                    "phone": user.phone,
                    "name": user.name,
                    "is_active": user.is_active,
                    "is_verified": user.is_verified,
                    "created_at": user.created_at.isoformat(),
                    "last_login_at": user.last_login_at.isoformat()
                    if user.last_login_at
                    else None,
                    "plan_id": sub.plan_id if sub else "free",
                    "is_premium": sub.is_premium if sub else False,
                }
            )
        return result

    async def list_subscriptions(self, limit: int = 50, offset: int = 0) -> list[dict]:
        rows = (
            await self._db.execute(
                select(Subscription, User.phone)
                .join(User, User.id == Subscription.user_id)
                .order_by(Subscription.updated_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
        return [
            {
                "user_id": str(sub.user_id),
                "phone": phone,
                "plan_id": sub.plan_id,
                "status": sub.status,
                "is_premium": sub.is_premium,
                "store": sub.store,
                "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
                "will_renew": sub.will_renew,
            }
            for sub, phone in rows
        ]

    async def moi_overview(self) -> dict[str, Any]:
        return {
            "events": await self._count(MoiEvent),
            "entries": await self._count(MoiEntry),
        }

    async def finance_overview(self) -> dict[str, Any]:
        return {
            "credits": await self._count(FinanceCredit),
            "loans": await self._count(FinanceLoan),
            "business_txns": await self._count(FinanceBusinessTxn),
        }

    async def ai_usage(self, limit: int = 50, offset: int = 0) -> dict[str, Any]:
        by_task = (
            await self._db.execute(
                select(AIUsage.task, func.count()).group_by(AIUsage.task)
            )
        ).all()
        recent = (
            await self._db.execute(
                select(AIUsage).order_by(AIUsage.created_at.desc()).limit(limit).offset(offset)
            )
        ).scalars().all()
        return {
            "by_task": {row[0]: int(row[1]) for row in by_task},
            "recent": [
                {
                    "task": u.task,
                    "provider": u.provider,
                    "domain": u.domain,
                    "success": u.success,
                    "latency_ms": u.latency_ms,
                    "created_at": u.created_at.isoformat(),
                }
                for u in recent
            ],
        }

    async def otp_activity(self, limit: int = 50, offset: int = 0) -> list[dict]:
        rows = (
            await self._db.execute(
                select(OTPRequest)
                .order_by(OTPRequest.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).scalars().all()
        return [
            {
                "phone": f"******{r.phone[-4:]}",
                "purpose": r.purpose,
                "channel": r.channel,
                "delivered": r.delivered,
                "verified": r.verified,
                "ip_address": r.ip_address,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]

    async def recent_audit(self, limit: int = 50, offset: int = 0) -> list[dict]:
        rows = (
            await self._db.execute(
                select(AuditLog)
                .order_by(AuditLog.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).scalars().all()
        return [
            {
                "actor_type": a.actor_type,
                "actor_id": a.actor_id,
                "action": a.action,
                "target_type": a.target_type,
                "target_id": a.target_id,
                "ip_address": a.ip_address,
                "created_at": a.created_at.isoformat(),
            }
            for a in rows
        ]
