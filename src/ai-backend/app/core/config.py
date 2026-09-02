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
    "console" if not IS_PRODUCTION else "twilio",
).lower()

if SMS_PROVIDER not in {"console", "twilio", "msg91"}:
    raise RuntimeError("SMS_PROVIDER must be one of: console, twilio, msg91.")

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

_default_cors_origins = "http://localhost:3000,http://localhost:5173"

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", _default_cors_origins).split(",")
    if origin.strip()
]


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
