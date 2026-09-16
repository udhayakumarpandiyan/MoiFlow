"""
Async SQLAlchemy database engine and session factory.

All database access uses async sessions so FastAPI's event loop
is never blocked by I/O.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import DATABASE_URL


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

database_url = DATABASE_URL

if database_url.startswith("postgresql://"):
    database_url = database_url.replace(
        "postgresql://",
        "postgresql+asyncpg://",
        1,
    )

engine = create_async_engine(
    database_url,
    echo=False,           # set True to log SQL in development
    pool_pre_ping=True,   # recycle stale connections
    pool_size=5,
    max_overflow=10,
)


# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# ---------------------------------------------------------------------------
# Base class for all ORM models
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Dependency — yields a session per request, always closes it
# ---------------------------------------------------------------------------

async def get_db() -> AsyncIterator[AsyncSession]:
    """
    FastAPI dependency that provides a database session.

    Usage:

        @router.post("/...")
        async def endpoint(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Table creation helper (used during startup in development)
# ---------------------------------------------------------------------------

async def create_tables() -> None:
    """
    Create all tables defined in ORM models.

    In production use Alembic migrations instead.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
