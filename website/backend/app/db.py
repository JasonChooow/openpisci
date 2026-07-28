"""Async SQLAlchemy engine, session factory, and FastAPI dependency.

Production deployments point ``DATABASE_URL`` at Postgres via the
``asyncpg`` driver (e.g. ``postgresql+asyncpg://user:pass@host/dbname``).
Local development/tests default to a SQLite file through ``aiosqlite`` so
the gateway modules can be imported and exercised without a live Postgres
instance (see :mod:`app.config`).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import get_settings

logger = logging.getLogger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Return the process-wide async engine, creating it on first use."""
    global _engine
    if _engine is None:
        settings = get_settings()
        connect_args: dict = {}
        if settings.database_url.startswith("sqlite"):
            # Allow the sqlite file's parent dir to be created lazily and
            # avoid the "database is locked" cross-thread check since we
            # only ever use it from the event loop.
            connect_args["check_same_thread"] = False
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.db_echo,
            connect_args=connect_args,
        )
        logger.info("[gateway] db engine created url=%s", _mask_url(settings.database_url))
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the process-wide session factory, creating it on first use."""
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_factory


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Context manager for scripts/background tasks (not a FastAPI dependency).

    Commits on clean exit, rolls back on exception.
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding an :class:`AsyncSession`.

    Usage: ``session: AsyncSession = Depends(get_session)``. Does not
    auto-commit; callers are responsible for committing writes.
    """
    factory = get_session_factory()
    async with factory() as session:
        yield session


async def init_models() -> None:
    """Create all tables from :data:`app.models.Base.metadata`.

    Intended for local development/tests only. Production schema changes
    go through Alembic migrations (see ``alembic/``).
    """
    from .models import Base

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def dispose_engine() -> None:
    """Dispose the engine's connection pool (for clean shutdown/tests)."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


def reset_db_cache() -> None:
    """Synchronously drop cached engine/session singletons.

    Used by test fixtures that change ``DATABASE_URL`` between tests. Does
    not dispose the underlying connection pool; prefer :func:`dispose_engine`
    when running inside an event loop.
    """
    global _engine, _session_factory
    _engine = None
    _session_factory = None


def _mask_url(url: str) -> str:
    """Redact credentials from a database URL before logging it."""
    if "@" not in url:
        return url
    scheme_and_creds, _, rest = url.partition("@")
    scheme, _, _ = scheme_and_creds.partition("://")
    return f"{scheme}://***@{rest}"
