"""
Moi-domain cloud ORM models.

Kept in a separate package from Finance so the two domains never share model
modules. These are cloud mirrors of the mobile app's offline-first SQLite data,
used for premium multi-device sync and admin read-only overview.
"""

from app.db.models.moi.moi_records import MoiEvent, MoiEntry

__all__ = ["MoiEvent", "MoiEntry"]
