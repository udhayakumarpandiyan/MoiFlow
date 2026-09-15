"""
Moi cloud-sync repository.

Upserts and reads the Moi cloud mirror tables (moi_events, moi_entries) keyed
by (user_id, client_id). Kept separate from Finance so the two domains never
share sync logic.
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.moi import MoiEvent, MoiEntry


def _f(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class MoiSyncRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # -- Events -----------------------------------------------------------

    async def upsert_events(
        self, user_id: uuid.UUID, records: list[dict[str, Any]]
    ) -> tuple[int, int]:
        upserted = 0
        skipped = 0
        for rec in records:
            client_id = str(rec.get("client_id") or "").strip()
            if not client_id:
                skipped += 1
                continue
            existing = (
                await self._db.execute(
                    select(MoiEvent).where(
                        MoiEvent.user_id == user_id,
                        MoiEvent.client_id == client_id,
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                existing = MoiEvent(user_id=user_id, client_id=client_id, name="")
                self._db.add(existing)
            existing.name = str(rec.get("name") or existing.name or "")
            existing.event_type = rec.get("event_type") or rec.get("type")
            existing.event_date = rec.get("event_date") or rec.get("date")
            existing.village_name = rec.get("village_name") or rec.get("villageName")
            upserted += 1
        await self._db.flush()
        return upserted, skipped

    async def get_events(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = (
            await self._db.execute(
                select(MoiEvent).where(MoiEvent.user_id == user_id)
            )
        ).scalars().all()
        return [
            {
                "client_id": r.client_id,
                "name": r.name,
                "event_type": r.event_type,
                "event_date": r.event_date,
                "village_name": r.village_name,
                "updated_at": r.updated_at.isoformat(),
            }
            for r in rows
        ]

    # -- Entries ----------------------------------------------------------

    async def upsert_entries(
        self, user_id: uuid.UUID, records: list[dict[str, Any]]
    ) -> tuple[int, int]:
        upserted = 0
        skipped = 0
        for rec in records:
            client_id = str(rec.get("client_id") or "").strip()
            if not client_id:
                skipped += 1
                continue
            existing = (
                await self._db.execute(
                    select(MoiEntry).where(
                        MoiEntry.user_id == user_id,
                        MoiEntry.client_id == client_id,
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                existing = MoiEntry(
                    user_id=user_id, client_id=client_id, direction="IN"
                )
                self._db.add(existing)
            existing.event_client_id = rec.get("event_client_id") or rec.get("eventId")
            existing.direction = str(rec.get("direction") or existing.direction or "IN")
            existing.person_name = rec.get("person_name") or rec.get("personName")
            existing.village_name = rec.get("village_name") or rec.get("villageName")
            existing.amount = _f(rec.get("amount") or rec.get("cashAmount"))
            existing.gift_note = rec.get("gift_note") or rec.get("note")
            existing.entry_date = rec.get("entry_date") or rec.get("date")
            upserted += 1
        await self._db.flush()
        return upserted, skipped

    async def get_entries(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = (
            await self._db.execute(
                select(MoiEntry).where(MoiEntry.user_id == user_id)
            )
        ).scalars().all()
        return [
            {
                "client_id": r.client_id,
                "event_client_id": r.event_client_id,
                "direction": r.direction,
                "person_name": r.person_name,
                "village_name": r.village_name,
                "amount": float(r.amount),
                "gift_note": r.gift_note,
                "entry_date": r.entry_date,
                "updated_at": r.updated_at.isoformat(),
            }
            for r in rows
        ]
