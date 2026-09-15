"""
OTP request history repository.

Records an audit row for each OTP send/verify. The live OTP value is never
stored here (it lives hashed in the OTP store); this is history only, for
abuse detection and admin activity monitoring.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.otp_request import OTPRequest


class OTPRequestRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def record_send(
        self,
        *,
        phone: str,
        channel: str,
        delivered: bool,
        purpose: str = "login",
        ip_address: str | None = None,
    ) -> OTPRequest:
        row = OTPRequest(
            phone=phone,
            purpose=purpose,
            channel=channel,
            delivered=delivered,
            verified=False,
            ip_address=ip_address,
        )
        self._db.add(row)
        await self._db.flush()
        return row

    async def mark_latest_verified(self, phone: str) -> None:
        """
        Mark the most recent OTP request for this phone as verified.
        Best-effort: used for activity monitoring, not for auth decisions.
        """
        from sqlalchemy import select, update

        result = await self._db.execute(
            select(OTPRequest.id)
            .where(OTPRequest.phone == phone)
            .order_by(OTPRequest.created_at.desc())
            .limit(1)
        )
        latest_id = result.scalar_one_or_none()
        if latest_id is not None:
            await self._db.execute(
                update(OTPRequest)
                .where(OTPRequest.id == latest_id)
                .values(verified=True)
            )
