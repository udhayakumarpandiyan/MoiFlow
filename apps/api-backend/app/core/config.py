"""
Application configuration.

Local development:
    Uses .env via python-dotenv.

Production:
    Environment variables must be provided by the hosting platform
    (Render, AWS, Azure, etc.).

Never commit .env or production secrets to source control.
"""

import os
from pathlib import Path

from dotenv import load_dotenv


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"

# Load .env only for local development.
if not IS_PRODUCTION:
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"Required environment variable '{name}' is not configured."
        )
    return value


def get_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise RuntimeError(
            f"Environment variable '{name}' must be an integer."
        ) from exc


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

APP_NAME = os.getenv("APP_NAME", "MoiFlow AI")
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")


# ---------------------------------------------------------------------------
# JWT / Session
# ---------------------------------------------------------------------------

if IS_PRODUCTION:
    JWT_SECRET_KEY = get_required_env("JWT_SECRET_KEY")
else:
    JWT_SECRET_KEY = os.getenv(
        "JWT_SECRET_KEY",
        "development-only-secret-change-me",
    )

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = get_int_env("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", 1440)


# ---------------------------------------------------------------------------
# OTP
# ---------------------------------------------------------------------------

OTP_LENGTH = get_int_env("OTP_LENGTH", 6)
OTP_EXPIRY_SECONDS = get_int_env("OTP_EXPIRY_SECONDS", 300)
OTP_MAX_ATTEMPTS = get_int_env("OTP_MAX_ATTEMPTS", 5)
OTP_MAX_SEND_PER_HOUR = get_int_env("OTP_MAX_SEND_PER_HOUR", 5)


# ---------------------------------------------------------------------------
# OTP Storage
# ---------------------------------------------------------------------------

OTP_STORE_BACKEND = os.getenv(
    "OTP_STORE_BACKEND",
    "memory" if not IS_PRODUCTION else "redis",
).lower()

if OTP_STORE_BACKEND not in {"memory", "redis"}:
    raise RuntimeError("OTP_STORE_BACKEND must be either 'memory' or 'redis'.")

if IS_PRODUCTION and OTP_STORE_BACKEND != "redis":
    raise RuntimeError("Production environment requires OTP_STORE_BACKEND=redis.")


# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------

if OTP_STORE_BACKEND == "redis":
    REDIS_URL = get_required_env("REDIS_URL")
else:
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


# ---------------------------------------------------------------------------
# SMS
# ---------------------------------------------------------------------------

SMS_PROVIDER = os.getenv(
    "SMS_PROVIDER",
    "console" if not IS_PRODUCTION else "twofactor",
).lower()

if SMS_PROVIDER not in {"console", "twilio", "msg91", "twofactor"}:
    raise RuntimeError(
        "SMS_PROVIDER must be one of: console, twilio, msg91, twofactor."
    )

if IS_PRODUCTION and SMS_PROVIDER == "console":
    raise RuntimeError("Console SMS provider cannot be used in production.")


# ---------------------------------------------------------------------------
# Twilio
# ---------------------------------------------------------------------------

if SMS_PROVIDER == "twilio":
    TWILIO_ACCOUNT_SID = get_required_env("TWILIO_ACCOUNT_SID")
    TWILIO_AUTH_TOKEN = get_required_env("TWILIO_AUTH_TOKEN")
    TWILIO_FROM_NUMBER = get_required_env("TWILIO_FROM_NUMBER")
else:
    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")


# ---------------------------------------------------------------------------
# MSG91
# ---------------------------------------------------------------------------

if SMS_PROVIDER == "msg91":
    MSG91_AUTH_KEY = get_required_env("MSG91_AUTH_KEY")
    MSG91_TEMPLATE_ID = get_required_env("MSG91_TEMPLATE_ID")
else:
    MSG91_AUTH_KEY = os.getenv("MSG91_AUTH_KEY", "")
    MSG91_TEMPLATE_ID = os.getenv("MSG91_TEMPLATE_ID", "")


# ---------------------------------------------------------------------------
# 2Factor (SMS OTP provider — https://2factor.in)
# ---------------------------------------------------------------------------
# 2Factor exposes two OTP flows:
#   1. Their AUTOGEN flow, where 2Factor generates + stores + verifies the OTP.
#   2. A "send a value we generate" flow, where we pass our own OTP.
# We use option (2) so the OTP lifecycle (rate limiting, attempts, expiry)
# stays owned by our backend and 2Factor is only the delivery channel. The
# API key is a backend-only secret and must never reach the mobile app.

if SMS_PROVIDER == "twofactor":
    TWOFACTOR_API_KEY = get_required_env("TWOFACTOR_API_KEY")
else:
    TWOFACTOR_API_KEY = os.getenv("TWOFACTOR_API_KEY", "")

# Optional named template/sender registered in the 2Factor dashboard.
TWOFACTOR_TEMPLATE_NAME = os.getenv("TWOFACTOR_TEMPLATE_NAME", "")
TWOFACTOR_SENDER_ID = os.getenv("TWOFACTOR_SENDER_ID", "")


# ---------------------------------------------------------------------------
# RevenueCat (subscription management)
# ---------------------------------------------------------------------------
# RevenueCat is the source of truth for subscription state. The backend never
# runs payment logic; it only ingests RevenueCat webhooks and reads status.
# The webhook is authenticated with a shared Authorization header value that
# we configure in the RevenueCat dashboard.

REVENUECAT_WEBHOOK_AUTH_TOKEN = os.getenv("REVENUECAT_WEBHOOK_AUTH_TOKEN", "")
# Optional REST API key for reconciliation / fetching subscriber info.
REVENUECAT_API_KEY = os.getenv("REVENUECAT_API_KEY", "")

if IS_PRODUCTION and not REVENUECAT_WEBHOOK_AUTH_TOKEN:
    raise RuntimeError(
        "REVENUECAT_WEBHOOK_AUTH_TOKEN must be configured in production to "
        "authenticate incoming RevenueCat webhooks."
    )


# ---------------------------------------------------------------------------
# Sarvam AI (Tamil voice / text understanding, summaries, suggestions)
# ---------------------------------------------------------------------------
# The AI provider is pluggable. Default is Sarvam; "none" disables AI (useful
# for local dev without a key). The API key is backend-only.

AI_PROVIDER = os.getenv(
    "AI_PROVIDER",
    "sarvam" if not IS_PRODUCTION else "sarvam",
).lower()

if AI_PROVIDER not in {"sarvam", "none"}:
    raise RuntimeError("AI_PROVIDER must be one of: sarvam, none.")

if AI_PROVIDER == "sarvam":
    if IS_PRODUCTION:
        SARVAM_API_KEY = get_required_env("SARVAM_API_KEY")
    else:
        SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
else:
    SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")

SARVAM_BASE_URL = os.getenv("SARVAM_BASE_URL", "https://api.sarvam.ai")
SARVAM_CHAT_MODEL = os.getenv("SARVAM_CHAT_MODEL", "sarvam-m")


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
# Admin accounts are separate from mobile users. A bootstrap admin can be
# seeded from env on first migration/run so there is always a way in.

ADMIN_BOOTSTRAP_EMAIL = os.getenv("ADMIN_BOOTSTRAP_EMAIL", "")
ADMIN_BOOTSTRAP_PASSWORD = os.getenv("ADMIN_BOOTSTRAP_PASSWORD", "")
# Admin JWTs are signed with the same secret but carry a distinct token type.
ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES = get_int_env(
    "ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES", 480
)


# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------

if IS_PRODUCTION:
    DATABASE_URL = get_required_env("DATABASE_URL")
else:
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/moiflow",
    )


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# CORS_ALLOWED_ORIGINS is a comma-separated list of exact origins, e.g.
#   https://admin.moiflow.in,https://admin2.moiflow.in
# Use "*" to allow all origins (wildcard). Values are sanitised so accidental
# inline "# comments", surrounding whitespace, or trailing slashes do not break
# the browser preflight — a common cause of "CORS error" on login.

_default_cors_origins = "https://admin.moiflow.in","http://localhost:3000,http://localhost:5173"


def _parse_cors_origins(raw: str) -> list[str]:
    origins: list[str] = []
    for part in raw.split(","):
        # Drop anything after a '#' so an inline comment can't become a bogus
        # origin (e.g. "* #https://x" -> "*").
        cleaned = part.split("#", 1)[0].strip()
        if not cleaned:
            continue
        # Normalise a trailing slash — the browser Origin header never has one,
        # and "https://x/" would silently fail to match "https://x".
        if cleaned != "*":
            cleaned = cleaned.rstrip("/")
        origins.append(cleaned)
    return origins


CORS_ALLOWED_ORIGINS = _parse_cors_origins(
    os.getenv("CORS_ALLOWED_ORIGINS", _default_cors_origins)
)

# When "*" is requested we must NOT also send Access-Control-Allow-Credentials:
# true (the browser rejects that combination). This flag lets main.py configure
# the middleware correctly.
CORS_ALLOW_ALL = "*" in CORS_ALLOWED_ORIGINS
CORS_ALLOW_CREDENTIALS = not CORS_ALLOW_ALL


# ---------------------------------------------------------------------------
# Production validation
# ---------------------------------------------------------------------------

def validate_production_config() -> None:
    if not IS_PRODUCTION:
        return

    if JWT_SECRET_KEY in {
        "CHANGE-ME-IN-PRODUCTION",
        "development-only-secret-change-me",
    }:
        raise RuntimeError(
            "A secure JWT_SECRET_KEY must be configured in production."
        )

    if len(JWT_SECRET_KEY) < 32:
        raise RuntimeError("JWT_SECRET_KEY should contain at least 32 characters.")

    if OTP_LENGTH < 4 or OTP_LENGTH > 8:
        raise RuntimeError("OTP_LENGTH must be between 4 and 8.")

    if OTP_EXPIRY_SECONDS <= 0:
        raise RuntimeError("OTP_EXPIRY_SECONDS must be greater than zero.")

    if OTP_MAX_ATTEMPTS <= 0:
        raise RuntimeError("OTP_MAX_ATTEMPTS must be greater than zero.")

    if OTP_MAX_SEND_PER_HOUR <= 0:
        raise RuntimeError("OTP_MAX_SEND_PER_HOUR must be greater than zero.")

    if SMS_PROVIDER == "twofactor" and not TWOFACTOR_API_KEY:
        raise RuntimeError("TWOFACTOR_API_KEY must be set when SMS_PROVIDER=twofactor.")

    if not REVENUECAT_WEBHOOK_AUTH_TOKEN:
        raise RuntimeError(
            "REVENUECAT_WEBHOOK_AUTH_TOKEN must be configured in production."
        )

    if AI_PROVIDER == "sarvam" and not SARVAM_API_KEY:
        raise RuntimeError("SARVAM_API_KEY must be set when AI_PROVIDER=sarvam.")
