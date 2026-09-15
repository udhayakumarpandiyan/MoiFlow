"""2Factor SMS OTP integration (importable name for `integrations/2factor`)."""

from app.integrations.twofactor.client import TwoFactorClient, send_otp_via_2factor

__all__ = ["TwoFactorClient", "send_otp_via_2factor"]
