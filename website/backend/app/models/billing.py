"""Usage records, global billing config, and admin accounts.

``UsageRecord`` is the immutable audit trail behind Property 7 (usage
record completeness) and Property 4 (billing deduction accuracy) in
design.md. ``BillingConfig`` stores JSON-encoded key/value pairs such as
``daily_free_credits``. ``AdminUser`` is authenticated separately from
regular ``User`` accounts (independent JWT scope, see task 9.2).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base
from .user import User


class UsageRecord(Base):
    __tablename__ = "usage_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    model_id: Mapped[str] = mapped_column(String(128))  # model name string
    provider_id: Mapped[int] = mapped_column(ForeignKey("llm_providers.id"))
    prompt_tokens: Mapped[int] = mapped_column(Integer)
    completion_tokens: Mapped[int] = mapped_column(Integer)
    cost: Mapped[float] = mapped_column(Float)  # actual amount deducted (CNY)
    request_id: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True
    )

    user: Mapped["User"] = relationship()


class BillingConfig(Base):
    __tablename__ = "billing_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True)  # e.g. "daily_free_credits"
    value: Mapped[str] = mapped_column(Text)  # JSON-encoded value
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="admin")  # admin / super_admin
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
