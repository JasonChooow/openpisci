"""Tests for /api/auth/agentos binding + handoff (我的云Agent电脑 SSO)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.anyio


@pytest.fixture()
def agentos_client(isolated_backend, tmp_path, monkeypatch):
    """TestClient with a dedicated tmp sqlite DB and registerable users."""
    import app.config as config
    import app.db as db

    db_path = tmp_path / "agentos-test.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    config._settings = None  # type: ignore[attr-defined]
    db.reset_db_cache()

    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c


class _FakeResp:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = ""

    def json(self):
        return self._payload


def _register(client: TestClient) -> str:
    resp = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "pw-123456", "email": "alice@example.com"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_status_requires_auth(agentos_client):
    assert agentos_client.get("/api/auth/agentos/status").status_code == 401


def test_bind_status_handoff_flow(agentos_client, monkeypatch):
    import app.api.auth_agentos as mod

    calls: list[tuple[str, dict]] = []

    async def fake_post(path: str, payload: dict) -> _FakeResp:
        calls.append((path, payload))
        if path == "/api/auth/device/token":
            assert payload["username"] == "agent-user"
            assert payload["password"] == "agent-pw"
            return _FakeResp(200, {"access_token": "session_old", "refresh_token": "rt-1"})
        if path == "/api/auth/device/refresh":
            assert payload["refresh_token"] == "rt-1"
            return _FakeResp(200, {"access_token": "session_abc123", "refresh_token": "rt-2"})
        raise AssertionError(f"unexpected path {path}")

    monkeypatch.setattr(mod, "_agentos_post", fake_post)

    token = _register(agentos_client)

    st = agentos_client.get("/api/auth/agentos/status", headers=_auth(token))
    assert st.status_code == 200 and st.json()["bound"] is False

    b = agentos_client.post(
        "/api/auth/agentos/bind",
        json={"username": "agent-user", "password": "agent-pw"},
        headers=_auth(token),
    )
    assert b.status_code == 200, b.text
    assert b.json() == {"bound": True, "external_username": "agent-user"}

    st = agentos_client.get("/api/auth/agentos/status", headers=_auth(token))
    assert st.json()["bound"] is True
    assert st.json()["external_username"] == "agent-user"

    h = agentos_client.post("/api/auth/agentos/handoff", headers=_auth(token))
    assert h.status_code == 200, h.text
    assert h.json()["url"].endswith("/?sso_session=session_abc123")
    assert h.json()["external_username"] == "agent-user"

    # Rotated refresh token must be persisted for the next handoff.
    assert calls[-1] == ("/api/auth/device/refresh", {"refresh_token": "rt-1"})


def test_bind_wrong_password(agentos_client, monkeypatch):
    import app.api.auth_agentos as mod

    async def fake_post(path: str, payload: dict) -> _FakeResp:
        return _FakeResp(401, {"detail": "用户名或密码错误"})

    monkeypatch.setattr(mod, "_agentos_post", fake_post)
    token = _register(agentos_client)

    b = agentos_client.post(
        "/api/auth/agentos/bind",
        json={"username": "agent-user", "password": "bad"},
        headers=_auth(token),
    )
    assert b.status_code == 400

    st = agentos_client.get("/api/auth/agentos/status", headers=_auth(token))
    assert st.json()["bound"] is False


def test_handoff_requires_rebind_on_expired_refresh(agentos_client, monkeypatch):
    import app.api.auth_agentos as mod

    async def fake_post(path: str, payload: dict) -> _FakeResp:
        if path == "/api/auth/device/token":
            return _FakeResp(200, {"access_token": "s", "refresh_token": "rt-1"})
        return _FakeResp(401, {"detail": "refresh token 已失效"})

    monkeypatch.setattr(mod, "_agentos_post", fake_post)
    token = _register(agentos_client)

    agentos_client.post(
        "/api/auth/agentos/bind",
        json={"username": "u", "password": "p"},
        headers=_auth(token),
    )
    h = agentos_client.post("/api/auth/agentos/handoff", headers=_auth(token))
    assert h.status_code == 401
    assert "重新绑定" in h.json()["detail"]


def test_handoff_unbound_404(agentos_client):
    token = _register(agentos_client)
    h = agentos_client.post("/api/auth/agentos/handoff", headers=_auth(token))
    assert h.status_code == 404


def test_unbind(agentos_client, monkeypatch):
    import app.api.auth_agentos as mod

    async def fake_post(path: str, payload: dict) -> _FakeResp:
        return _FakeResp(200, {"access_token": "s", "refresh_token": "rt-1"})

    monkeypatch.setattr(mod, "_agentos_post", fake_post)
    token = _register(agentos_client)

    agentos_client.post(
        "/api/auth/agentos/bind",
        json={"username": "u", "password": "p"},
        headers=_auth(token),
    )
    d = agentos_client.delete("/api/auth/agentos/bind", headers=_auth(token))
    assert d.status_code == 200 and d.json()["bound"] is False

    st = agentos_client.get("/api/auth/agentos/status", headers=_auth(token))
    assert st.json()["bound"] is False
