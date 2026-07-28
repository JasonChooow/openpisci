"""Focused integration tests for cloud user authentication endpoints."""

from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine


@pytest.fixture()
def auth_client(
    isolated_backend: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[TestClient, Path]]:
    database_path = tmp_path / "auth.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database_path}")

    import app.config as config
    import app.db as db
    from app.auth.jwt import reset_revocations
    from app.models import Base

    config._settings = None  # type: ignore[attr-defined]
    db.reset_db_cache()
    reset_revocations()

    schema_engine = create_engine(f"sqlite:///{database_path}")
    Base.metadata.create_all(schema_engine)
    schema_engine.dispose()

    from app.main import create_app

    with TestClient(create_app()) as client:
        yield client, database_path

    asyncio.run(db.dispose_engine())
    config._settings = None  # type: ignore[attr-defined]
    reset_revocations()


def _register(client: TestClient, **overrides) -> dict:
    payload = {
        "username": "alice",
        "password": "correct horse battery staple",
        "phone": "+8613800138000",
        "email": "Alice@Example.com",
    }
    payload.update(overrides)
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_register_hashes_password_and_rejects_duplicate(auth_client):
    client, database_path = auth_client
    body = _register(client)

    assert body["user"] == {
        "id": 1,
        "username": "alice",
        "email": "alice@example.com",
        "balance": 0.0,
    }
    assert body["access_token"]
    assert body["refresh_token"]

    from jose import jwt

    assert jwt.get_unverified_header(body["access_token"])["alg"] == "HS256"
    assert jwt.get_unverified_header(body["refresh_token"])["alg"] == "HS256"

    with sqlite3.connect(database_path) as connection:
        password_hash = connection.execute(
            "SELECT password_hash FROM users WHERE username = ?", ("alice",)
        ).fetchone()[0]
    assert password_hash != "correct horse battery staple"
    assert password_hash.startswith("$2")

    duplicate = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "another password"},
    )
    assert duplicate.status_code == 409


def test_device_token_validates_database_credentials(auth_client):
    client, _ = auth_client
    _register(client)

    invalid = client.post(
        "/api/auth/device/token",
        json={"username": "alice", "password": "wrong", "device_name": "test"},
    )
    assert invalid.status_code == 401

    missing = client.post(
        "/api/auth/device/token",
        json={"username": "unknown", "password": "wrong", "device_name": "test"},
    )
    assert missing.status_code == 401

    valid = client.post(
        "/api/auth/device/token",
        json={
            "username": "alice",
            "password": "correct horse battery staple",
            "device_name": "desktop-test",
        },
    )
    assert valid.status_code == 200, valid.text
    assert valid.json()["user"]["username"] == "alice"
    assert valid.json()["access_token"]


def test_balance_requires_authenticated_database_user(auth_client):
    client, database_path = auth_client
    session = _register(client)

    unauthenticated = client.get("/api/auth/user/balance")
    assert unauthenticated.status_code == 401

    with sqlite3.connect(database_path) as connection:
        connection.execute("UPDATE users SET balance = 12.5 WHERE username = 'alice'")
        connection.commit()

    response = client.get(
        "/api/auth/user/balance",
        headers={"Authorization": f"Bearer {session['access_token']}"},
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"balance": 12.5, "currency": "CNY"}


def test_send_code_logout_and_logged_out_token_rejection(auth_client):
    client, _ = auth_client
    session = _register(client)
    headers = {"Authorization": f"Bearer {session['access_token']}"}

    send_code = client.post("/api/auth/send-code", json={"phone": "+8613800138000"})
    assert send_code.status_code == 200
    assert send_code.json() == {"success": True, "expires_in": 300}

    logout = client.post("/api/auth/logout", headers=headers)
    assert logout.status_code == 200
    assert logout.json() == {"success": True}

    rejected = client.get("/api/auth/user/balance", headers=headers)
    assert rejected.status_code == 401
