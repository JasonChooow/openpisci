"""SMS / WeChat / password-reset auth flows."""

from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert

from app.auth.captcha import _store as captcha_store
from app.auth.captcha import reset_captcha_store
from app.auth.password import hash_password
from app.auth.sms_codes import reset_sms_store
from app.auth.wechat_sessions import reset_wechat_sessions
from app.models import Base, User


def _captcha_pair(client: TestClient) -> tuple[str, str]:
    challenge = client.get("/api/auth/captcha")
    assert challenge.status_code == 200
    captcha_id = challenge.json()["captcha_id"]
    answer = captcha_store[captcha_id].answer
    return captcha_id, answer


@pytest.fixture()
def social_client(
    isolated_backend: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[TestClient]:
    database_path = tmp_path / "social.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database_path}")
    monkeypatch.setenv("MARKET_DEV_ENDPOINTS", "1")

    import app.config as config
    import app.db as db
    from app.auth.jwt import reset_revocations

    config._settings = None  # type: ignore[attr-defined]
    db.reset_db_cache()
    reset_revocations()
    reset_sms_store()
    reset_captcha_store()
    reset_wechat_sessions()

    schema_engine = create_engine(f"sqlite:///{database_path}")
    Base.metadata.create_all(schema_engine)
    with schema_engine.begin() as conn:
        conn.execute(
            insert(User).values(
                username="phoneuser",
                password_hash=hash_password("old-password-1"),
                phone="13900001111",
                balance=10.0,
                role="user",
            )
        )
    schema_engine.dispose()

    from app.main import create_app

    with TestClient(create_app()) as client:
        yield client

    asyncio.run(db.dispose_engine())
    config._settings = None  # type: ignore[attr-defined]
    reset_revocations()
    reset_sms_store()
    reset_captcha_store()
    reset_wechat_sessions()


def test_sms_requires_captcha_and_enforces_resend_cooldown(social_client: TestClient):
    client = social_client
    missing = client.post(
        "/api/auth/send-code",
        json={"phone": "13900001111", "purpose": "login"},
    )
    assert missing.status_code == 422

    captcha_id, answer = _captcha_pair(client)
    sent = client.post(
        "/api/auth/send-code",
        json={
            "phone": "13900001111",
            "purpose": "login",
            "captcha_id": captcha_id,
            "captcha_code": answer,
        },
    )
    assert sent.status_code == 200
    assert sent.json()["dev_code"] == "123456"
    assert sent.json()["resend_after"] == 60

    captcha_id2, answer2 = _captcha_pair(client)
    again = client.post(
        "/api/auth/send-code",
        json={
            "phone": "13900001111",
            "purpose": "login",
            "captcha_id": captcha_id2,
            "captcha_code": answer2,
        },
    )
    assert again.status_code == 429
    assert "Retry-After" in again.headers

    login = client.post(
        "/api/auth/sms/login",
        json={"phone": "13900001111", "code": "123456"},
    )
    assert login.status_code == 200
    assert login.json()["access_token"]


def test_password_reset_with_captcha(social_client: TestClient):
    client = social_client
    captcha_id, answer = _captcha_pair(client)
    reset_code = client.post(
        "/api/auth/send-code",
        json={
            "phone": "13900001111",
            "purpose": "reset",
            "captcha_id": captcha_id,
            "captcha_code": answer,
        },
    )
    assert reset_code.status_code == 200
    reset = client.post(
        "/api/auth/password/reset",
        json={
            "phone": "13900001111",
            "code": "123456",
            "new_password": "new-password-9",
        },
    )
    assert reset.status_code == 200
    device = client.post(
        "/api/auth/device/token",
        json={"username": "phoneuser", "password": "new-password-9"},
    )
    assert device.status_code == 200


def test_wechat_desktop_session_auto_login_flow(social_client: TestClient):
    client = social_client
    started = client.post("/api/auth/wechat/desktop-session")
    assert started.status_code == 200
    session_id = started.json()["session_id"]
    authorize_url = started.json()["authorize_url"]
    assert session_id in authorize_url

    page = client.get(authorize_url)
    assert page.status_code == 200
    assert "确认授权并返回应用" in page.text
    assert "无需复制授权码" in page.text or "自动" in page.text

    pending = client.get(f"/api/auth/wechat/desktop-session/{session_id}")
    assert pending.json()["status"] == "pending"

    confirm = client.post(f"/api/auth/wechat/desktop-session/{session_id}/confirm")
    assert confirm.status_code == 200

    done = client.get(f"/api/auth/wechat/desktop-session/{session_id}")
    body = done.json()
    assert body["status"] == "needs_profile"
    assert body["pending_token"]

    captcha_id, answer = _captcha_pair(client)
    bind = client.post(
        "/api/auth/send-code",
        json={
            "phone": "13700002222",
            "purpose": "bind",
            "captcha_id": captcha_id,
            "captcha_code": answer,
        },
    )
    assert bind.status_code == 200

    complete = client.post(
        "/api/auth/wechat/complete-profile",
        json={
            "pending_token": body["pending_token"],
            "username": "wx_user_a",
            "phone": "13700002222",
            "sms_code": "123456",
            "password": "wx-pass-1",
        },
    )
    assert complete.status_code == 201, complete.text
    assert complete.json()["access_token"]


def test_captcha_svg_contains_challenge(social_client: TestClient):
    page = social_client.get("/api/auth/captcha")
    assert page.status_code == 200
    svg = page.json()["image_svg"]
    assert svg.startswith("<svg")
    assert re.search(r"<text ", svg)
