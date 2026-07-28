"""Shared SQLAlchemy 2.0 declarative base.

All ORM models in :mod:`app.models` inherit from this single ``Base`` so
that ``Base.metadata`` reflects the complete schema for Alembic migrations
and ``create_all``-based test setup.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base class for all ORM models."""
