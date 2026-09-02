"""
MoiFlow FastAPI application.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.nlu import router as nlu_router
from app.api.auth import router as auth_router
from app.api.ocr import router as ocr_router

from app.core.config import (
    APP_NAME,
    APP_VERSION,
    CORS_ALLOWED_ORIGINS,
    IS_PRODUCTION,
    validate_production_config,
)
from app.db.database import create_tables


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Production configuration validation (runs at import time)
# ---------------------------------------------------------------------------

validate_production_config()


# ---------------------------------------------------------------------------
# Startup / shutdown lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    On startup:
        - Create database tables if they don't exist.
          (In production, prefer Alembic migrations.)

    On shutdown:
        - Nothing needed for now; SQLAlchemy disposes engine on GC.
    """
    if not IS_PRODUCTION:
        # Auto-create tables in development for convenience.
        await create_tables()
        logger.info("Database tables verified / created.")
    else:
        logger.info(
            "Production mode: skipping auto table creation. "
            "Run `alembic upgrade head` to apply migrations."
        )

    yield


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

app.include_router(nlu_router, prefix="/api/nlu")
app.include_router(auth_router, prefix="/api/auth")
app.include_router(ocr_router, prefix="/api/ocr")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
def health():
    """Health check endpoint used by load balancers and monitoring."""
    return {"status": "ok"}


@app.get("/")
def home():
    return {"message": "MoiFlow AI is running", "version": APP_VERSION}
