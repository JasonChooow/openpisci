"""FastAPI dependencies for optional / required authentication."""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .jwt import JWTError, extract_username

security = HTTPBearer(auto_error=False)


async def optional_username(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[str]:
    """Return the authenticated username or ``None`` for anonymous requests."""
    if not credentials or not credentials.credentials:
        return None
    try:
        return extract_username(credentials.credentials)
    except JWTError:
        return None


async def require_username(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    """Return the authenticated username or raise ``401``."""
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    try:
        return extract_username(credentials.credentials)
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"登录已过期或无效: {e}",
        ) from e
