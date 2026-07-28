"""Cloud user registration, login, logout, and account endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_username, security
from ..auth.jwt import JWTError, issue_token_pair, revoke_token, verify_token
from ..auth.password import hash_password, verify_password
from ..db import get_session
from ..models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

_REGISTER_PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>注册云端账户</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: linear-gradient(160deg, #eef4ff, #f7fafc 55%, #edf2f7); color: #1a202c; }
    main { width: min(420px, calc(100vw - 2rem)); background: #fff; border-radius: 16px;
      padding: 2rem; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12); }
    h1 { margin: 0 0 0.35rem; font-size: 1.45rem; }
    p { margin: 0 0 1.25rem; color: #4a5568; line-height: 1.5; }
    label { display: grid; gap: 0.35rem; margin-bottom: 0.9rem; font-size: 0.92rem; }
    input { border: 1px solid #cbd5e0; border-radius: 10px; padding: 0.7rem 0.85rem; font: inherit; }
    button { width: 100%; margin-top: 0.4rem; border: 0; border-radius: 10px; padding: 0.85rem;
      background: #2563eb; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: 0.65; cursor: wait; }
    .msg { margin-top: 1rem; padding: 0.75rem 0.9rem; border-radius: 10px; display: none; }
    .msg.ok { display: block; background: #ecfdf5; color: #065f46; }
    .msg.err { display: block; background: #fef2f2; color: #991b1b; }
  </style>
</head>
<body>
  <main>
    <h1>注册云端账户</h1>
    <p>注册成功后请返回桌面端，用同一用户名密码登录。</p>
    <form id="form">
      <label>用户名<input name="username" autocomplete="username" required /></label>
      <label>密码<input name="password" type="password" autocomplete="new-password" required minlength="6" /></label>
      <label>邮箱（可选）<input name="email" type="email" autocomplete="email" /></label>
      <button type="submit">创建账户</button>
    </form>
    <div id="msg" class="msg" role="status"></div>
  </main>
  <script>
    const form = document.getElementById("form");
    const msg = document.getElementById("msg");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const button = form.querySelector("button");
      button.disabled = true;
      msg.className = "msg";
      msg.textContent = "";
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = body.detail;
          const text = typeof detail === "string" ? detail
            : (body.error || ("注册失败 (" + res.status + ")"));
          throw new Error(text);
        }
        msg.className = "msg ok";
        msg.textContent = "注册成功：用户 " + body.user.username + "。请返回桌面端登录。";
        form.reset();
      } catch (error) {
        msg.className = "msg err";
        msg.textContent = error.message || "注册失败";
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>
"""


@router.get("/register", response_class=HTMLResponse)
async def register_page():
    """Browser registration page opened by the desktop "前往云端注册" button."""
    return HTMLResponse(_REGISTER_PAGE)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=255)
    sms_code: str | None = None

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("username is required")
        return value

    @field_validator("phone", "email")
    @classmethod
    def normalize_optional_contact(cls, value: str | None, info) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        return value.lower() if info.field_name == "email" else value


class DeviceTokenRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)
    device_name: str | None = Field(default=None, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("username is required")
        return value


def _user_payload(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "balance": user.balance,
    }


def _session_payload(user: User) -> dict[str, object]:
    access_token, refresh_token = issue_token_pair(user.username)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "Bearer",
        "user": _user_payload(user),
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    conditions = [User.username == request.username]
    if request.phone:
        conditions.append(User.phone == request.phone)
    if request.email:
        conditions.append(User.email == request.email)
    existing = await session.scalar(select(User).where(or_(*conditions)))
    if existing is not None:
        raise HTTPException(status_code=409, detail="username, phone, or email already registered")

    try:
        password_hash = hash_password(request.password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    user = User(
        username=request.username,
        password_hash=password_hash,
        phone=request.phone,
        email=request.email,
        balance=0.0,
        role="user",
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="username, phone, or email already registered"
        ) from exc
    await session.refresh(user)
    return _session_payload(user)


@router.post("/device/token")
async def device_token(
    request: DeviceTokenRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    user = await session.scalar(select(User).where(User.username == request.username))
    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _session_payload(user)


@router.post("/logout")
async def logout(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
):
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="请先登录")
    try:
        verify_token(credentials.credentials)
        revoke_token(credentials.credentials)
    except JWTError as exc:
        raise HTTPException(
            status_code=401,
            detail=f"登录已过期或无效: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    return {"success": True}


@router.get("/user/balance")
async def user_balance(
    username: Annotated[str, Depends(require_username)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    user = await session.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=401, detail="authenticated user no longer exists")
    return {"balance": user.balance, "currency": "CNY"}
