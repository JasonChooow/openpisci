"""Per-model routing configuration and the strategy enum.

Consumed by the routing engine (task 1.4) via ``RoutingConfigCache``.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base
from .model import Model


class RoutingStrategy(str, Enum):
    CHEAPEST_FIRST = "cheapest_first"
    ROUND_ROBIN = "round_robin"
    PRIORITY = "priority"
    FALLBACK_CHAIN = "fallback_chain"
    LATENCY_BASED = "latency_based"


class ModelRoutingConfig(Base):
    __tablename__ = "model_routing_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("models.id"), unique=True)
    strategy: Mapped[str] = mapped_column(String(32))  # RoutingStrategy value
    fallback_chain: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # [provider_id, ...]
    rate_limit_rpm: Mapped[int] = mapped_column(Integer, default=60)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    model: Mapped["Model"] = relationship()
