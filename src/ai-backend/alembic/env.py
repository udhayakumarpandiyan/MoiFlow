"""
Alembic environment configuration for async SQLAlchemy.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

# Import all models so Alembic detects them for autogenerate
from app.db.database import Base
from app.db.models import User  # noqa: F401

# Alembic config
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Use the DATABASE_URL from environment if available
import os
from app.core.config import DATABASE_URL

config.set_main_option("sqlalchemy.url", DATABASE_URL)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
