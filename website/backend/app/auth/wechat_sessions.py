"""Desktop WeChat login bridge: browser authorizes, desktop polls result."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Literal

SessionStatus = Literal["pending", "needs_profile", "authorized", "expired"]
SESSION_TTL_SECONDS = 300


@dataclass
class DesktopWechatSession:
    status: SessionStatus = "pending"
    created_at: float = field(default_factory=time.time)
    expires_at: float = field(default_factory=lambda: time.time() + SESSION_TTL_SECONDS)
    result: dict[str, Any] | None = None
    message: str | None = None


_sessions: dict[str, DesktopWechatSession] = {}


def reset_wechat_sessions() -> None:
    _sessions.clear()


def create_desktop_session() -> str:
    session_id = secrets.token_urlsafe(18)
    _sessions[session_id] = DesktopWechatSession()
    return session_id


def get_session(session_id: str) -> DesktopWechatSession | None:
    session = _sessions.get(session_id)
    if session is None:
        return None
    if time.time() > session.expires_at and session.status == "pending":
        session.status = "expired"
    return session


def complete_session(session_id: str, *, status: SessionStatus, result: dict[str, Any], message: str | None = None) -> bool:
    session = get_session(session_id)
    if session is None or session.status not in ("pending",):
        return False
    if session.status == "expired":
        return False
    session.status = status
    session.result = result
    session.message = message
    return True
