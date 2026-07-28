"""bcrypt password hashing helpers for cloud users."""

from __future__ import annotations

import bcrypt

_BCRYPT_ROUNDS = 12
_MAX_PASSWORD_BYTES = 72


def _password_bytes(password: str) -> bytes:
    encoded = password.encode("utf-8")
    if not encoded:
        raise ValueError("password is required")
    if len(encoded) > _MAX_PASSWORD_BYTES:
        raise ValueError("password must not exceed 72 UTF-8 bytes")
    return encoded


def hash_password(password: str) -> str:
    """Return a bcrypt hash suitable for ``User.password_hash``."""
    return bcrypt.hashpw(
        _password_bytes(password), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    ).decode("ascii")


# Marker for accounts created via WeChat (or other SSO) that have no password yet.
WECHAT_PASSWORD_PLACEHOLDER = "!wechat-no-password!"


def is_password_login_enabled(password_hash: str | None) -> bool:
    """False when the account cannot authenticate with username/password."""
    if not password_hash:
        return False
    return not password_hash.startswith("!")


def verify_password(password: str, password_hash: str) -> bool:
    """Safely compare plaintext with a stored bcrypt hash."""
    if not is_password_login_enabled(password_hash):
        return False
    try:
        return bcrypt.checkpw(_password_bytes(password), password_hash.encode("ascii"))
    except (TypeError, ValueError, UnicodeEncodeError):
        return False
