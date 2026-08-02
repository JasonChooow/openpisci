"""theAgentOS account binding — "我的云Agent电脑" single sign-on.

Flow:
1. ``POST /bind``    — user proves ownership of an AgentOS account once;
   we verify it against AgentOS ``/api/auth/device/token`` and store the
   returned refresh token.
2. ``POST /handoff`` — on every entry from the desktop, we exchange the
   stored refresh token for a fresh AgentOS web session via
   ``/api/auth/device/refresh`` (rotating the refresh token) and return a
   ``?sso_session=`` URL the desktop loads directly, no login prompt.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_username
from ..config import get_settings
from ..db import get_session
from ..models.binding import ExternalAccountBinding
from ..models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth/agentos", tags=["agentos-binding"])

SYSTEM = "agentos"
_HTTP_TIMEOUT = 10.0


class BindRequest(BaseModel):
    username: str
    password: str


def _agentos_api() -> str:
    return get_settings().agentos_api_base


def _agentos_web() -> str:
    return get_settings().agentos_web_url


async def _agentos_post(path: str, payload: dict) -> httpx.Response:
    """Single hop to the AgentOS backend (patched in tests)."""
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        return await client.post(f"{_agentos_api()}{path}", json=payload)


async def _current_user(username: str, session: AsyncSession) -> User:
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


async def _get_binding(user_id: int, session: AsyncSession) -> Optional[ExternalAccountBinding]:
    result = await session.execute(
        select(ExternalAccountBinding).where(
            ExternalAccountBinding.user_id == user_id,
            ExternalAccountBinding.system == SYSTEM,
        )
    )
    return result.scalar_one_or_none()


@router.get("/status")
async def binding_status(
    username: str = Depends(require_username),
    session: AsyncSession = Depends(get_session),
):
    user = await _current_user(username, session)
    binding = await _get_binding(user.id, session)
    return {
        "bound": binding is not None,
        "external_username": binding.external_username if binding else None,
        "web_url": _agentos_web(),
    }


@router.post("/bind")
async def bind_account(
    body: BindRequest,
    username: str = Depends(require_username),
    session: AsyncSession = Depends(get_session),
):
    user = await _current_user(username, session)

    try:
        resp = await _agentos_post(
            "/api/auth/device/token",
            {
                "username": body.username,
                "password": body.password,
                "device_name": "9xbot-desktop",
            },
        )
    except httpx.HTTPError as e:
        logger.warning("[agentos] bind: cannot reach AgentOS backend: %s", e)
        raise HTTPException(status_code=502, detail="无法连接云 Agent 电脑服务，请稍后重试")

    if resp.status_code in (401, 403):
        raise HTTPException(status_code=400, detail="云 Agent 电脑账号或密码错误")
    if resp.status_code != 200:
        logger.warning("[agentos] bind: unexpected status %s: %s", resp.status_code, resp.text[:200])
        raise HTTPException(status_code=502, detail="云 Agent 电脑服务异常，请稍后重试")

    data = resp.json()
    refresh_token = data.get("refresh_token") or ""
    if not refresh_token:
        raise HTTPException(status_code=502, detail="云 Agent 电脑未返回刷新令牌，无法绑定")

    binding = await _get_binding(user.id, session)
    if binding is None:
        binding = ExternalAccountBinding(
            user_id=user.id,
            system=SYSTEM,
            external_username=body.username,
            refresh_token=refresh_token,
        )
        session.add(binding)
    else:
        binding.external_username = body.username
        binding.refresh_token = refresh_token
    await session.commit()

    logger.info("[agentos] user %s bound AgentOS account %s", username, body.username)
    return {"bound": True, "external_username": body.username}


@router.delete("/bind")
async def unbind_account(
    username: str = Depends(require_username),
    session: AsyncSession = Depends(get_session),
):
    user = await _current_user(username, session)
    binding = await _get_binding(user.id, session)
    if binding is not None:
        await session.delete(binding)
        await session.commit()
    return {"bound": False}


@router.post("/handoff")
async def handoff(
    username: str = Depends(require_username),
    session: AsyncSession = Depends(get_session),
):
    """Exchange the stored AgentOS refresh token for a fresh web session URL."""
    user = await _current_user(username, session)
    binding = await _get_binding(user.id, session)
    if binding is None or not binding.refresh_token:
        raise HTTPException(status_code=404, detail="尚未绑定云 Agent 电脑账号")

    try:
        resp = await _agentos_post(
            "/api/auth/device/refresh",
            {"refresh_token": binding.refresh_token},
        )
    except httpx.HTTPError as e:
        logger.warning("[agentos] handoff: cannot reach AgentOS backend: %s", e)
        raise HTTPException(status_code=502, detail="无法连接云 Agent 电脑服务，请稍后重试")

    if resp.status_code == 401:
        # Refresh token expired/revoked — user must re-bind once.
        raise HTTPException(status_code=401, detail="绑定已过期，请重新绑定")
    if resp.status_code != 200:
        logger.warning("[agentos] handoff: unexpected status %s: %s", resp.status_code, resp.text[:200])
        raise HTTPException(status_code=502, detail="云 Agent 电脑服务异常，请稍后重试")

    data = resp.json()
    session_id = data.get("access_token") or ""
    new_refresh = data.get("refresh_token") or ""
    if not session_id:
        raise HTTPException(status_code=502, detail="云 Agent 电脑未返回会话")

    if new_refresh:
        binding.refresh_token = new_refresh
        await session.commit()

    return {
        "url": f"{_agentos_web()}/?sso_session={session_id}",
        "external_username": binding.external_username,
    }
