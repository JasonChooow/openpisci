"""Upstream LLM provider model.

``api_key_encrypted`` stores the upstream API key encrypted at rest
(AES-256, see app.gateway for the encryption helper added in a later task).
``health_status`` and ``avg_latency_ms`` are maintained by the routing
engine's health checks (task 1.4).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class LlmProvider(Base):
    __tablename__ = "llm_providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    base_url: Mapped[str] = mapped_column(String(512))
    api_key_encrypted: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    health_status: Mapped[str] = mapped_column(String(20), default="unknown")
    avg_latency_ms: Mapped[int] = mapped_column(Integer, default=0)
