"""
Application configuration loaded from environment variables.
Uses python-dotenv for local development.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the ai-backend root
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)


# ---------------------------------------------------------------------------
# JWT / Session
# ---------------------------------------------------------------------------

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "CHANGE-ME-IN-PRODUCTION")
JWT_ALGORITHM = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24h default


# ---------------------------------------------------------------------------
# OTP
# ---------------------------------------------------------------------------

OTP_LENGTH = int(os.getenv("OTP_LENGTH", "6"))
OTP_EXPIRY_SECONDS = int(os.getenv("OTP_EXPIRY_SECONDS", "300"))
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
OTP_MAX_SEND_PER_HOUR = int(os.getenv("OTP_MAX_SEND_PER_HOUR", "5"))
OTP_STORE_BACKEND = os.getenv("OTP_STORE_BACKEND", "memory")


# ---------------------------------------------------------------------------
# SMS
# ---------------------------------------------------------------------------

SMS_PROVIDER = os.getenv("SMS_PROVIDER", "console")


# ---------------------------------------------------------------------------
# Redis (optional)
# ---------------------------------------------------------------------------

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
