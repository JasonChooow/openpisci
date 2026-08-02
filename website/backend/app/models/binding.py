"""External account bindings — link a 9xBot cloud user to third-party systems.

Currently supports theAgentOS ("云 Agent 电脑"): binding stores theAgentOS
refresh token so the backend can mint fresh web sessions on demand
(handoff) without asking the user for credentials again.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class ExternalAccountBinding(Base):
    __tablename__ = "external_account_bindings"
    __table_args__ = (
        UniqueConstraint("user_id", "system", name="uq_binding_user_system"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    system: Mapped[str] = mapped_column(String(32))  # e.g. "agentos"
    external_username: Mapped[str] = mapped_column(String(128))
    # theAgentOS device refresh token (JWT, rotated on every handoff).
    refresh_token: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
