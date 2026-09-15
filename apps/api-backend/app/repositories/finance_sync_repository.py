"""
Finance cloud-sync repository.

Upserts and reads the Finance cloud mirror tables (finance_credits,
finance_loans, finance_business_txns) keyed by (user_id, client_id). Kept
separate from Moi so the two domains never share sync logic.
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.finance import FinanceCredit, FinanceLoan, FinanceBusinessTxn


def _f(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _i(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


class FinanceSyncRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _upsert(
        self, model, user_id: uuid.UUID, client_id: str
    ):
        existing = (
            await self._db.execute(
                select(model).where(
                    model.user_id == user_id, model.client_id == client_id
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            existing = model(user_id=user_id, client_id=client_id)
            self._db.add(existing)
        return existing

    # -- Credits ----------------------------------------------------------

    async def upsert_credits(
        self, user_id: uuid.UUID, records: list[dict[str, Any]]
    ) -> tuple[int, int]:
        up = skip = 0
        for rec in records:
            cid = str(rec.get("client_id") or "").strip()
            if not cid:
                skip += 1
                continue
            row = await self._upsert(FinanceCredit, user_id, cid)
            row.direction = str(rec.get("direction") or "IN")
            row.amount = _f(rec.get("amount"))
            row.interest_rate = _f(rec.get("interest_rate") or rec.get("interestRate"))
            row.person = rec.get("person")
            row.village = rec.get("village")
            row.status = str(rec.get("status") or "UPCOMING")
            row.txn_date = rec.get("txn_date") or rec.get("txnDate")
            row.notes = rec.get("notes")
            up += 1
        await self._db.flush()
        return up, skip

    async def get_credits(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = (
            await self._db.execute(
                select(FinanceCredit).where(FinanceCredit.user_id == user_id)
            )
        ).scalars().all()
        return [
            {
                "client_id": r.client_id,
                "direction": r.direction,
                "amount": float(r.amount),
                "interest_rate": float(r.interest_rate),
                "person": r.person,
                "village": r.village,
                "status": r.status,
                "txn_date": r.txn_date,
                "notes": r.notes,
                "updated_at": r.updated_at.isoformat(),
            }
            for r in rows
        ]

    # -- Loans ------------------------------------------------------------

    async def upsert_loans(
        self, user_id: uuid.UUID, records: list[dict[str, Any]]
    ) -> tuple[int, int]:
        up = skip = 0
        for rec in records:
            cid = str(rec.get("client_id") or "").strip()
            if not cid:
                skip += 1
                continue
            row = await self._upsert(FinanceLoan, user_id, cid)
            row.loan_type = str(rec.get("loan_type") or rec.get("loanType") or "PERSONAL")
            row.loan_amount = _f(rec.get("loan_amount") or rec.get("loanAmount"))
            row.provider = rec.get("provider")
            row.interest_rate = _f(rec.get("interest_rate") or rec.get("interestRate"))
            row.monthly_emi = _f(rec.get("monthly_emi") or rec.get("monthlyEmi"))
            row.total_emis = _i(rec.get("total_emis") or rec.get("totalEmis"))
            row.paid_emis = _i(rec.get("paid_emis") or rec.get("paidEmis"))
            row.status = str(rec.get("status") or "ACTIVE")
            row.start_date = rec.get("start_date") or rec.get("startDate")
            up += 1
        await self._db.flush()
        return up, skip

    async def get_loans(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = (
            await self._db.execute(
                select(FinanceLoan).where(FinanceLoan.user_id == user_id)
            )
        ).scalars().all()
        return [
            {
                "client_id": r.client_id,
                "loan_type": r.loan_type,
                "loan_amount": float(r.loan_amount),
                "provider": r.provider,
                "interest_rate": float(r.interest_rate),
                "monthly_emi": float(r.monthly_emi),
                "total_emis": r.total_emis,
                "paid_emis": r.paid_emis,
                "status": r.status,
                "start_date": r.start_date,
                "updated_at": r.updated_at.isoformat(),
            }
            for r in rows
        ]

    # -- Business transactions -------------------------------------------

    async def upsert_business(
        self, user_id: uuid.UUID, records: list[dict[str, Any]]
    ) -> tuple[int, int]:
        up = skip = 0
        for rec in records:
            cid = str(rec.get("client_id") or "").strip()
            if not cid:
                skip += 1
                continue
            row = await self._upsert(FinanceBusinessTxn, user_id, cid)
            row.kind = str(rec.get("kind") or "SALE")
            row.party_name = rec.get("party_name") or rec.get("partyName")
            row.description = rec.get("description")
            row.amount = _f(rec.get("amount"))
            row.amount_settled = _f(rec.get("amount_settled") or rec.get("amountSettled"))
            row.txn_date = rec.get("txn_date") or rec.get("date")
            up += 1
        await self._db.flush()
        return up, skip

    async def get_business(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = (
            await self._db.execute(
                select(FinanceBusinessTxn).where(
                    FinanceBusinessTxn.user_id == user_id
                )
            )
        ).scalars().all()
        return [
            {
                "client_id": r.client_id,
                "kind": r.kind,
                "party_name": r.party_name,
                "description": r.description,
                "amount": float(r.amount),
                "amount_settled": float(r.amount_settled),
                "txn_date": r.txn_date,
                "updated_at": r.updated_at.isoformat(),
            }
            for r in rows
        ]
