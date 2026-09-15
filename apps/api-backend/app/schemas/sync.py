"""
Pydantic schemas for cloud sync (Moi + Finance).

Sync is a simple push/pull of the mobile SQLite rows to per-user cloud mirrors.
The mobile app remains authoritative offline; the cloud copy exists for premium
multi-device sync and admin overview. Rows are identified by the mobile
`client_id` (the SQLite row id) and upserted per user.

Payloads are intentionally permissive dicts per record so the mobile side can
evolve fields without a breaking backend change; each domain endpoint maps the
known fields it cares about.
"""

from typing import Any

from pydantic import BaseModel, Field


class SyncPushRequest(BaseModel):
    """A batch of records to upsert into the user's cloud mirror."""

    # Each item MUST include a "client_id" string; other keys are mapped by the
    # domain repository. Unknown keys are ignored.
    records: list[dict[str, Any]] = Field(default_factory=list)


class SyncPushResponse(BaseModel):
    upserted: int
    skipped: int


class SyncPullResponse(BaseModel):
    """All of the user's cloud-mirror records for a domain resource."""

    records: list[dict[str, Any]]
