"""Admin authentication: login endpoint and admin_required dependency.

Admin JWT tokens use the same HS256 algorithm as user tokens but are
distinguished by a ``token_use: "admin_access"`` claim and subject prefix
``admin:``. This ensures that regular user tokens cannot access admin
endpoints and vice versa.
"""

from __future__ import annotations

import time
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.password import verify_password
from ..config import get_settings
from ..db import get_session
from ..models import AdminUser

router = APIRouter(prefix="/api/admin/auth", tags=["admin-auth"])

_admin_security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Admin JWT helpers (independent from user JWT to avoid token cross-use)
# ---------------------------------------------------------------------------

_ADMIN_TOKEN_USE = "admin_access"
_ADMIN_SUB_PREFIX = "admin:"


def _jose():
    from jose import jwt as _jwt
    from jose.exceptions import JWTError as _JoseError

    return _jwt, _JoseError


def issue_admin_token(admin_user: AdminUser) -> str:
    """Sign an admin access token for the given admin user."""
    settings = get_settings()
    now = int(time.time())
    ttl = max(int(settings.jwt_ttl_seconds), 60)
    payload = {
        "sub": f"{_ADMIN_SUB_PREFIX}{admin_user.username}",
        "iat": now,
        "exp": now + ttl,
        "jti": uuid4().hex,
        "token_use": _ADMIN_TOKEN_USE,
        "role": admin_user.role,
    }
    jwt, _ = _jose()
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_admin_token(token: str) -> dict:
    """Verify and return claims of an admin token.

    Raises HTTPException(401) if the token is invalid, expired, or not an
    admin token.
    """
    if not token:
        raise HTTPException(status_code=401, detail="missing admin token")
    settings = get_settings()
    jwt, JoseError = _jose()
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp"]},
        )
    except JoseError as e:
        raise HTTPException(status_code=401, detail=f"invalid admin token: {e}") from e
    if claims.get("token_use") != _ADMIN_TOKEN_USE:
        raise HTTPException(status_code=401, detail="token is not an admin token")
    sub = claims.get("sub", "")
    if not sub.startswith(_ADMIN_SUB_PREFIX):
        raise HTTPException(status_code=401, detail="invalid admin token subject")
    return claims


# ---------------------------------------------------------------------------
# FastAPI dependency: admin_required
# ---------------------------------------------------------------------------


async def admin_required(
    credentials: HTTPAuthorizationCredentials | None = Depends(_admin_security),  # noqa: B008
) -> str:
    """FastAPI dependency that requires a valid admin JWT.

    Returns the admin username (without the 'admin:' prefix).
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="admin authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = verify_admin_token(credentials.credentials)
    # Strip the admin: prefix to return raw username
    return claims["sub"][len(_ADMIN_SUB_PREFIX):]


# ---------------------------------------------------------------------------
# Login endpoint
# ---------------------------------------------------------------------------


class AdminLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    admin: dict


@router.post("/login")
async def admin_login(
    request: AdminLoginRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Authenticate an admin user and return an admin JWT."""
    admin = await session.scalar(
        select(AdminUser).where(AdminUser.username == request.username)
    )
    if admin is None or not verify_password(request.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid admin credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = issue_admin_token(admin)
    return {
        "access_token": token,
        "token_type": "Bearer",
        "admin": {
            "id": admin.id,
            "username": admin.username,
            "role": admin.role,
        },
    }
