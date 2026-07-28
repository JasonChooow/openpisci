"""In-memory SMS verification codes (dev stub until a real SMS provider is wired)."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from typing import Literal

Purpose = Literal["login", "reset", "bind", "register"]

# Fixed code in development so desktop/UI can be exercised without SMS.
DEV_FIXED_CODE = "123456"
CODE_TTL_SECONDS = 300
RESEND_COOLDOWN_SECONDS = 60
MAX_SENDS_PER_HOUR = 8


class SmsRateLimitError(Exception):
    def __init__(self, message: str, *, retry_after: int):
        super().__init__(message)
        self.retry_after = retry_after


@dataclass
class _Entry:
    code: str
    purpose: Purpose
    expires_at: float


_store: dict[tuple[str, Purpose], _Entry] = {}
_last_sent_at: dict[tuple[str, Purpose], float] = {}
_send_history: dict[str, list[float]] = {}


def _normalize_phone(phone: str) -> str:
    return "".join(ch for ch in phone.strip() if ch.isdigit() or ch == "+")


def reset_sms_store() -> None:
    """Test helper."""
    _store.clear()
    _last_sent_at.clear()
    _send_history.clear()


def _enforce_rate_limits(phone: str, purpose: Purpose) -> None:
    key = (phone, purpose)
    now = time.time()
    last = _last_sent_at.get(key)
    if last is not None:
        elapsed = now - last
        if elapsed < RESEND_COOLDOWN_SECONDS:
            raise SmsRateLimitError(
                f"请 {int(RESEND_COOLDOWN_SECONDS - elapsed) + 1} 秒后再试",
                retry_after=int(RESEND_COOLDOWN_SECONDS - elapsed) + 1,
            )

    history = [ts for ts in _send_history.get(phone, []) if now - ts < 3600]
    if len(history) >= MAX_SENDS_PER_HOUR:
        raise SmsRateLimitError(
            "该手机号发送过于频繁，请稍后再试",
            retry_after=60,
        )
    _send_history[phone] = history


def issue_code(phone: str, purpose: Purpose, *, fixed_dev_code: bool = True) -> dict[str, object]:
    """Create/replace a verification code for ``phone`` + ``purpose``."""
    key_phone = _normalize_phone(phone)
    if len(key_phone) < 6:
        raise ValueError("invalid phone number")

    _enforce_rate_limits(key_phone, purpose)

    code = DEV_FIXED_CODE if fixed_dev_code else f"{secrets.randbelow(1_000_000):06d}"
    now = time.time()
    _store[(key_phone, purpose)] = _Entry(
        code=code,
        purpose=purpose,
        expires_at=now + CODE_TTL_SECONDS,
    )
    _last_sent_at[(key_phone, purpose)] = now
    history = _send_history.setdefault(key_phone, [])
    history.append(now)

    return {
        "success": True,
        "expires_in": CODE_TTL_SECONDS,
        "resend_after": RESEND_COOLDOWN_SECONDS,
        # Exposed only for local/dev stubs; production SMS provider will omit this.
        "dev_code": code if fixed_dev_code else None,
    }


def verify_code(phone: str, purpose: Purpose, code: str, *, consume: bool = True) -> bool:
    """Return True when the code matches and is unexpired."""
    key_phone = _normalize_phone(phone)
    entry = _store.get((key_phone, purpose))
    if entry is None:
        return False
    if time.time() > entry.expires_at:
        _store.pop((key_phone, purpose), None)
        return False
    if entry.code != str(code).strip():
        return False
    if consume:
        _store.pop((key_phone, purpose), None)
    return True
