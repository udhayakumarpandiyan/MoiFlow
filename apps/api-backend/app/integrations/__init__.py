"""
Third-party integrations.

Each provider is isolated in its own subpackage so it can be swapped without
touching business logic:
  - twofactor  -> 2Factor SMS OTP delivery (https://2factor.in)
  - revenuecat -> RevenueCat subscription webhooks / REST
  - sarvam     -> Sarvam AI (Tamil voice/text understanding)

All provider secrets are read from environment via app.core.config and never
leave the backend.
"""
