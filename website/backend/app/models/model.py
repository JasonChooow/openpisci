"""Model catalog and provider-to-model pricing/priority mapping."""

from __future__ import annotations

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base
from .provider import LlmProvider


class Model(Base):
    __tablename__ = "models"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)  # e.g. "gpt-4o"
    display_name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(32), default="chat")  # chat/embedding/image
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ProviderModel(Base):
    __tablename__ = "provider_models"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("llm_providers.id"))
    model_id: Mapped[int] = mapped_column(ForeignKey("models.id"))
    cost_input_per_1k: Mapped[float] = mapped_column(Float)  # CNY per 1K input tokens
    cost_output_per_1k: Mapped[float] = mapped_column(Float)  # CNY per 1K output tokens
    priority: Mapped[int] = mapped_column(Integer, default=0)  # higher = preferred
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    provider: Mapped["LlmProvider"] = relationship()
    model: Mapped["Model"] = relationship()
