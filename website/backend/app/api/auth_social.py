"""WeChat login, SMS login, and password reset endpoints."""

from __future__ import annotations

import hashlib
import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.captcha import create_captcha, reset_captcha_store, verify_captcha
from ..auth.jwt import (
    JWTError,
    issue_pending_wechat_token,
    verify_pending_wechat_token,
)
from ..auth.password import WECHAT_PASSWORD_PLACEHOLDER, hash_password
from ..auth.sms_codes import Purpose, SmsRateLimitError, issue_code, verify_code
from ..auth.wechat_sessions import (
    complete_session,
    create_desktop_session,
    get_session,
)
from ..config import get_settings
from ..db import get_session as get_db_session
from ..models import User
from .auth import _session_payload, _user_payload

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Re-export for tests that may reset stores.
__all__ = ["router", "reset_captcha_store"]


def _authorize_page_html(desktop_session: str) -> str:
    session_js = desktop_session.replace("\\", "\\\\").replace('"', '\\"')
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>微信授权登录</title>
  <style>
    body {{ margin:0; min-height:100vh; display:grid; place-items:center;
      font-family:"Segoe UI",system-ui,sans-serif; background:#f0fdf4; color:#14532d; }}
    main {{ width:min(420px,calc(100vw - 2rem)); background:#fff; border-radius:16px;
      padding:2rem; box-shadow:0 18px 40px rgba(20,83,45,.12); }}
    h1 {{ margin:0 0 .5rem; font-size:1.35rem; }}
    p {{ color:#3f6212; line-height:1.55; }}
    button {{ width:100%; border:0; border-radius:10px; padding:.9rem; margin-top:1rem;
      background:#07c160; color:#fff; font:600 15px inherit; cursor:pointer; }}
    button:disabled {{ opacity:.65; cursor:wait; }}
    .msg {{ margin-top:1rem; padding:.85rem; border-radius:10px; background:#ecfdf5; display:none; }}
    .msg.show {{ display:block; }}
    .err {{ background:#fef2f2; color:#991b1b; }}
  </style>
</head>
<body>
  <main>
    <h1>微信授权登录</h1>
    <p>正式环境将打开微信扫码。当前为开发联调：点击确认后，桌面端会自动完成登录，无需复制授权码。</p>
    <button type="button" id="btn">确认授权并返回应用</button>
    <div id="msg" class="msg" role="status"></div>
  </main>
  <script>
    const sessionId = "{session_js}";
    const btn = document.getElementById("btn");
    const msg = document.getElementById("msg");
    btn.onclick = async () => {{
      btn.disabled = true;
      msg.className = "msg show";
      msg.textContent = "正在授权…";
      try {{
        const res = await fetch("/api/auth/wechat/desktop-session/" + encodeURIComponent(sessionId) + "/confirm", {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify({{}}),
        }});
        const body = await res.json().catch(() => ({{}}));
        if (!res.ok) throw new Error(body.detail || "授权失败");
        msg.textContent = body.message || "授权成功，请返回桌面应用。";
        btn.textContent = "已授权";
      }} catch (error) {{
        msg.className = "msg show err";
        msg.textContent = error.message || "授权失败";
        btn.disabled = false;
      }}
    }};
  </script>
</body>
</html>"""


class SendCodeRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    purpose: Purpose = "login"
    captcha_id: str = Field(min_length=8, max_length=128)
    captcha_code: str = Field(min_length=3, max_length=12)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("phone is required")
        return value


class SmsLoginRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    code: str = Field(min_length=4, max_length=12)
    device_name: str | None = Field(default=None, max_length=128)


class PasswordResetRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    code: str = Field(min_length=4, max_length=12)
    new_password: str = Field(min_length=6, max_length=128)


class WechatLoginRequest(BaseModel):
    code: str = Field(min_length=1, max_length=256)
    device_name: str | None = Field(default=None, max_length=128)


class WechatCompleteProfileRequest(BaseModel):
    pending_token: str = Field(min_length=10)
    username: str = Field(min_length=1, max_length=64)
    phone: str = Field(min_length=6, max_length=20)
    sms_code: str = Field(min_length=4, max_length=12)
    password: str | None = Field(default=None, min_length=6, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("username is required")
        return value


def _openid_from_code(code: str) -> str:
    digest = hashlib.sha256(code.strip().encode("utf-8")).hexdigest()[:28]
    return f"wx_{digest}"


async def _wechat_login_payload(session: AsyncSession, code: str) -> dict[str, Any]:
    openid = _openid_from_code(code)
    user = await session.scalar(select(User).where(User.wechat_openid == openid))
    if user is not None:
        if user.role == "banned":
            raise HTTPException(status_code=403, detail="账户已被禁用")
        payload = _session_payload(user)
        payload["needs_profile"] = False
        payload["login_method"] = "wechat"
        return payload

    pending = issue_pending_wechat_token(openid)
    return {
        "needs_profile": True,
        "pending_token": pending,
        "wechat_openid": openid,
        "message": "首次微信登录，请补全用户名与手机号",
    }


@router.get("/captcha")
async def get_captcha():
    """Issue a graphic captcha required before sending SMS codes."""
    return create_captcha()


@router.get("/wechat/authorize", response_class=HTMLResponse)
async def wechat_authorize_page(
    desktop_session: str | None = Query(default=None, min_length=8, max_length=128),
):
    if not desktop_session:
        raise HTTPException(
            status_code=400,
            detail="请从桌面端发起微信登录（缺少 desktop_session）",
        )
    session = get_session(desktop_session)
    if session is None or session.status == "expired":
        raise HTTPException(status_code=404, detail="授权会话不存在或已过期，请回到应用重试")
    return HTMLResponse(_authorize_page_html(desktop_session))


@router.post("/wechat/desktop-session")
async def create_wechat_desktop_session(request: Request):
    session_id = create_desktop_session()
    base = str(request.base_url).rstrip("/")
    return {
        "session_id": session_id,
        "authorize_url": f"{base}/api/auth/wechat/authorize?desktop_session={session_id}",
        "expires_in": 300,
        "poll_interval_ms": 1500,
    }


@router.get("/wechat/desktop-session/{session_id}")
async def poll_wechat_desktop_session(session_id: str):
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="授权会话不存在")
    if session.status == "expired":
        return {"status": "expired", "message": "授权已超时，请重试"}
    if session.status == "pending":
        return {"status": "pending"}
    payload = {"status": session.status, "message": session.message}
    if session.result:
        payload.update(session.result)
    return payload


@router.post("/wechat/desktop-session/{session_id}/confirm")
async def confirm_wechat_desktop_session(
    session_id: str,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    desktop = get_session(session_id)
    if desktop is None or desktop.status == "expired":
        raise HTTPException(status_code=404, detail="授权会话不存在或已过期")
    if desktop.status != "pending":
        return {"success": True, "message": "已授权，请返回桌面应用"}

    # Dev stub: synthesize a stable OAuth code for this browser confirmation.
    code = f"desktop_{session_id}_{secrets.token_hex(4)}"
    result = await _wechat_login_payload(session, code)
    if result.get("needs_profile"):
        complete_session(
            session_id,
            status="needs_profile",
            result=result,
            message=result.get("message"),
        )
        return {"success": True, "message": "授权成功，请返回应用补全资料"}

    complete_session(
        session_id,
        status="authorized",
        result=result,
        message="授权成功，请返回桌面应用",
    )
    return {"success": True, "message": "授权成功，请返回桌面应用"}


@router.post("/send-code")
async def send_code(request: SendCodeRequest):
    settings = get_settings()
    if not settings.dev_endpoints:
        raise HTTPException(status_code=501, detail="SMS provider is not configured")
    if not verify_captcha(request.captcha_id, request.captcha_code):
        raise HTTPException(status_code=400, detail="图形验证码错误或已过期")
    try:
        return issue_code(request.phone, request.purpose, fixed_dev_code=True)
    except SmsRateLimitError as exc:
        raise HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/sms/login")
async def sms_login(
    request: SmsLoginRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    if not verify_code(request.phone, "login", request.code):
        raise HTTPException(status_code=401, detail="验证码无效或已过期")
    user = await session.scalar(select(User).where(User.phone == request.phone.strip()))
    if user is None:
        raise HTTPException(status_code=404, detail="该手机号尚未注册，请先注册或使用微信登录")
    if user.role == "banned":
        raise HTTPException(status_code=403, detail="账户已被禁用")
    payload = _session_payload(user)
    payload["login_method"] = "sms"
    return payload


@router.post("/password/reset")
async def password_reset(
    request: PasswordResetRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    if not verify_code(request.phone, "reset", request.code):
        raise HTTPException(status_code=401, detail="验证码无效或已过期")
    user = await session.scalar(select(User).where(User.phone == request.phone.strip()))
    if user is None:
        raise HTTPException(status_code=404, detail="该手机号尚未注册")
    try:
        user.password_hash = hash_password(request.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    return {"success": True, "message": "密码已重置，请使用新密码登录"}


@router.post("/wechat/login")
async def wechat_login(
    request: WechatLoginRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    return await _wechat_login_payload(session, request.code)


@router.post("/wechat/complete-profile", status_code=status.HTTP_201_CREATED)
async def wechat_complete_profile(
    request: WechatCompleteProfileRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    try:
        openid = verify_pending_wechat_token(request.pending_token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"微信授权已失效: {exc}") from exc

    if not verify_code(request.phone, "bind", request.sms_code):
        raise HTTPException(status_code=401, detail="短信验证码无效或已过期")

    existing_openid = await session.scalar(select(User).where(User.wechat_openid == openid))
    if existing_openid is not None:
        raise HTTPException(status_code=409, detail="该微信已绑定账户，请直接登录")

    conflict = await session.scalar(
        select(User).where(
            (User.username == request.username) | (User.phone == request.phone.strip())
        )
    )
    if conflict is not None:
        raise HTTPException(status_code=409, detail="用户名或手机号已被占用")

    if request.password:
        try:
            password_hash = hash_password(request.password)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    else:
        password_hash = WECHAT_PASSWORD_PLACEHOLDER

    user = User(
        username=request.username,
        password_hash=password_hash,
        phone=request.phone.strip(),
        wechat_openid=openid,
        balance=0.0,
        role="user",
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="用户名或手机号已被占用") from exc
    await session.refresh(user)
    payload = _session_payload(user)
    payload["needs_profile"] = False
    payload["login_method"] = "wechat"
    payload["user"] = _user_payload(user)
    return payload
