"""
RevenueCat webhook authentication.

RevenueCat authenticates webhooks with a shared secret sent in the
`Authorization` header (configured in the RevenueCat dashboard). We compare it
in constant time against REVENUECAT_WEBHOOK_AUTH_TOKEN.
"""

import hmac

from app.core.config import REVENUECAT_WEBHOOK_AUTH_TOKEN


def verify_webhook_auth(authorization_header: str | None) -> bool:
    """
    Return True if the incoming Authorization header matches our configured
    RevenueCat webhook secret. Constant-time comparison to avoid timing leaks.
    """
    expected = REVENUECAT_WEBHOOK_AUTH_TOKEN
    if not expected:
        # No secret configured — reject to fail closed.
        return False
    if not authorization_header:
        return False

    # Accept either the raw token or a "Bearer <token>" form.
    provided = authorization_header.strip()
    if provided.lower().startswith("bearer "):
        provided = provided[7:].strip()

    return hmac.compare_digest(provided, expected)
