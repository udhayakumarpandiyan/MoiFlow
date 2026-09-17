"""
MoiFlow FastAPI application.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.nlu import router as nlu_router
from app.api.auth import router as auth_router
from app.api.ocr import router as ocr_router
from app.api.subscriptions import router as subscriptions_router
from app.api.webhooks import router as webhooks_router
from app.api.ai import router as ai_router
from app.api.admin import router as admin_router
from app.api.moi import router as moi_router
from app.api.finance import router as finance_router

from app.core.config import (
    APP_NAME,
    APP_VERSION,
    CORS_ALLOW_CREDENTIALS,
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

    # Seed a bootstrap superadmin from env if configured (idempotent).
    try:
        from app.services.admin_service import bootstrap_admin

        await bootstrap_admin()
    except Exception:  # pragma: no cover — never block startup on this
        logger.exception("Admin bootstrap failed (continuing).")

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
# Security headers
# ---------------------------------------------------------------------------
# NOTE ON MIDDLEWARE ORDER: Starlette applies middleware in REVERSE of the order
# they are added (last added = outermost). We add SecurityHeaders FIRST and CORS
# LAST so that CORSMiddleware is the OUTERMOST layer. This guarantees the
# Access-Control-Allow-Origin header is attached to EVERY response — including
# error responses (401/500) and preflight — which is essential for the browser
# to accept them. A custom BaseHTTPMiddleware wrapping CORS can otherwise strip
# CORS headers on error paths.

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add conservative security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Cache-Control", "no-store"
        )
        if IS_PRODUCTION:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ---------------------------------------------------------------------------
# CORS  (added LAST so it is the OUTERMOST middleware — see note above)
# ---------------------------------------------------------------------------

_cors_kwargs = dict(
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=CORS_ALLOW_CREDENTIALS,
)

app.add_middleware(
        CORSMiddleware, allow_origins=CORS_ALLOWED_ORIGINS, **_cors_kwargs
    )

logger.info("CORS allowed origins: %s", CORS_ALLOWED_ORIGINS)


# ---------------------------------------------------------------------------
# Global error handling
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catch-all so unexpected errors return a consistent JSON body without
    leaking internals (stack traces / SQL). The full error is logged server-side.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

app.include_router(nlu_router, prefix="/api/nlu", tags=["NLU"])
app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(ocr_router, prefix="/api/ocr", tags=["OCR"])
app.include_router(
    subscriptions_router, prefix="/api/subscriptions", tags=["Subscriptions"]
)
app.include_router(webhooks_router, prefix="/api/webhooks", tags=["Webhooks"])
app.include_router(ai_router, prefix="/api/ai", tags=["AI"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(moi_router, prefix="/api/moi", tags=["Moi"])
app.include_router(finance_router, prefix="/api/finance", tags=["Finance"])


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
