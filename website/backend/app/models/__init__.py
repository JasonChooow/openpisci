"""SQLAlchemy 2.0 ORM models for the cloud-locked LLM gateway.

Importing this package pulls in every model module so that ``Base.metadata``
is fully populated for Alembic autogeneration and for ``create_all`` in
tests. Keep new model modules imported here.
"""

from __future__ import annotations

from .base import Base
from .billing import AdminUser, BillingConfig, UsageRecord
from .binding import ExternalAccountBinding
from .model import Model, ProviderModel
from .provider import LlmProvider
from .routing import ModelRoutingConfig, RoutingStrategy
from .user import User

__all__ = [
    "Base",
    "User",
    "ExternalAccountBinding",
    "LlmProvider",
    "Model",
    "ProviderModel",
    "RoutingStrategy",
    "ModelRoutingConfig",
    "UsageRecord",
    "BillingConfig",
    "AdminUser",
]
