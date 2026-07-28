"""HS256 JWT issue, verification, and in-process session revocation helpers."""

from __future__ import annotations

import hashlib
import time
from typing import Any, Dict, Optional
from uuid import uuid4

from ..config import get_settings


class JWTError(Exception):
    """Raised when a token cannot be verified."""


# Revocations intentionally live in-process because the current database design has
# no session table. Session IDs link access and refresh tokens so logout invalidates
# the complete issued pair for the lifetime of the refresh token.
_revoked_sessions: dict[str, int] = {}
_revoked_legacy_tokens: dict[str, int] = {}


def _jose():
    """Import python-jose lazily to keep lightweight module inspection working."""
    from jose import jwt as _jwt  # type: ignore
    from jose.exceptions import JWTError as _JoseError  # type: ignore

    return _jwt, _JoseError


def _encode_token(
    username: str,
    *,
    token_use: str,
    expires_at: int,
    session_id: str,
    session_expires_at: int,
) -> str:
    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": username,
        "iat": now,
        "exp": expires_at,
        "jti": uuid4().hex,
        "sid": session_id,
        "session_exp": session_expires_at,
        "token_use": token_use,
    }
    jwt, _ = _jose()
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def issue_token(username: str, *, ttl_seconds: Optional[int] = None) -> str:
    """Sign a backward-compatible access token for ``username``."""
    uname = str(username or "").strip()
    if not uname:
        raise ValueError("username is required")
    settings = get_settings()
    now = int(time.time())
    ttl = max(int(ttl_seconds if ttl_seconds is not None else settings.jwt_ttl_seconds), 60)
    expires_at = now + ttl
    return _encode_token(
        uname,
        token_use="access",
        expires_at=expires_at,
        session_id=uuid4().hex,
        session_expires_at=expires_at,
    )


def issue_token_pair(username: str) -> tuple[str, str]:
    """Issue linked access and refresh HS256 JWTs for a cloud session."""
    uname = str(username or "").strip()
    if not uname:
        raise ValueError("username is required")
    settings = get_settings()
    now = int(time.time())
    access_exp = now + max(int(settings.jwt_ttl_seconds), 60)
    refresh_exp = now + max(int(settings.jwt_ttl_seconds) * 4, 60 * 60 * 24 * 30)
    session_id = uuid4().hex
    access_token = _encode_token(
        uname,
        token_use="access",
        expires_at=access_exp,
        session_id=session_id,
        session_expires_at=refresh_exp,
    )
    refresh_token = _encode_token(
        uname,
        token_use="refresh",
        expires_at=refresh_exp,
        session_id=session_id,
        session_expires_at=refresh_exp,
    )
    return access_token, refresh_token


def _token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _prune_revocations(now: int) -> None:
    for collection in (_revoked_sessions, _revoked_legacy_tokens):
        expired = [key for key, expires_at in collection.items() if expires_at <= now]
        for key in expired:
            collection.pop(key, None)


def _decode_signed_token(token: str) -> Dict[str, Any]:
    if not token:
        raise JWTError("empty token")
    settings = get_settings()
    jwt, JoseError = _jose()
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp"]},
        )
    except JoseError as e:  # type: ignore[misc]
        raise JWTError(str(e)) from e
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise JWTError("token missing sub")
    return claims


def verify_token(token: str) -> Dict[str, Any]:
    """Return access-token claims, rejecting expired, refresh, and revoked tokens."""
    claims = _decode_signed_token(token)
    now = int(time.time())
    _prune_revocations(now)
    session_id = claims.get("sid")
    if isinstance(session_id, str) and session_id in _revoked_sessions:
        raise JWTError("token has been revoked")
    if _token_fingerprint(token) in _revoked_legacy_tokens:
        raise JWTError("token has been revoked")
    if claims.get("token_use") == "refresh":
        raise JWTError("refresh token cannot be used as an access token")
    if claims.get("token_use") == "wechat_pending":
        raise JWTError("pending wechat token cannot be used as an access token")
    return claims


def revoke_token(token: str) -> None:
    """Revoke the session represented by a valid signed token."""
    claims = _decode_signed_token(token)
    now = int(time.time())
    _prune_revocations(now)
    session_id = claims.get("sid")
    if isinstance(session_id, str) and session_id:
        expires_at = int(claims.get("session_exp", claims["exp"]))
        _revoked_sessions[session_id] = expires_at
    else:
        _revoked_legacy_tokens[_token_fingerprint(token)] = int(claims["exp"])


def reset_revocations() -> None:
    """Clear revocation state for isolated tests."""
    _revoked_sessions.clear()
    _revoked_legacy_tokens.clear()


def extract_username(token: str) -> str:
    """Verify ``token`` and return the existing ``sub`` username claim."""
    return str(verify_token(token)["sub"]).strip()


def issue_pending_wechat_token(openid: str, *, ttl_seconds: int = 60 * 30) -> str:
    """Short-lived token for WeChat users who still need phone/username."""
    openid = str(openid or "").strip()
    if not openid:
        raise ValueError("openid is required")
    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": f"wechat:{openid}",
        "iat": now,
        "exp": now + max(int(ttl_seconds), 60),
        "jti": uuid4().hex,
        "token_use": "wechat_pending",
        "wechat_openid": openid,
    }
    jwt, _ = _jose()
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_pending_wechat_token(token: str) -> str:
    """Return ``wechat_openid`` from a pending WeChat completion token."""
    claims = _decode_signed_token(token)
    if claims.get("token_use") != "wechat_pending":
        raise JWTError("not a wechat pending token")
    openid = claims.get("wechat_openid")
    if not isinstance(openid, str) or not openid.strip():
        raise JWTError("pending token missing wechat_openid")
    return openid.strip()
