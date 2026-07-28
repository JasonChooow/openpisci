"""Integration tests for admin management API (task 9.2).

Tests cover the core CRUD paths:
- Provider create / read / update / delete / health-check
- Model create / read / update / delete + provider mapping
- Routing config update
- User balance adjustment, role update
- Billing config read / write

All tests seed an admin user and use an admin JWT.
"""

from __future__ import annotations

import asyncio
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine


@pytest.fixture()
def admin_api(
    isolated_backend: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[TestClient, str]]:
    """Provide a TestClient with seeded admin + admin JWT token."""
    database_path = tmp_path / "admin_mgmt.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database_path}")

    from app import config, db
    from app.auth.jwt import reset_revocations
    from app.auth.password import hash_password
    from app.models import Base

    config._settings = None  # type: ignore[attr-defined]
    db.reset_db_cache()
    reset_revocations()

    # Create all tables
    schema_engine = create_engine(f"sqlite:///{database_path}")
    Base.metadata.create_all(schema_engine)
    schema_engine.dispose()

    # Seed an admin user
    with sqlite3.connect(database_path) as conn:
        pw_hash = hash_password("admin-pass-xyz")
        conn.execute(
            "INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)",
            ("testadmin", pw_hash, "super_admin"),
        )
        conn.commit()

    from app.main import create_app

    client = TestClient(create_app())

    # Login to get admin token
    login_resp = client.post(
        "/api/admin/auth/login",
        json={"username": "testadmin", "password": "admin-pass-xyz"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    yield client, token

    client.close()
    asyncio.run(db.dispose_engine())
    config._settings = None  # type: ignore[attr-defined]
    reset_revocations()


# ---------------------------------------------------------------------------
# Provider CRUD
# ---------------------------------------------------------------------------


class TestProviderCRUD:
    def test_create_provider(self, admin_api):
        client, token = admin_api
        resp = client.post(
            "/api/admin/providers",
            json={
                "name": "openai-test",
                "base_url": "https://api.openai.com/v1",
                "api_key_encrypted": "enc-key-123",
                "is_active": True,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "openai-test"
        assert body["base_url"] == "https://api.openai.com/v1"
        assert body["is_active"] is True
        assert "id" in body

    def test_list_providers(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}

        # Create two providers
        client.post(
            "/api/admin/providers",
            json={"name": "provider-a", "base_url": "https://a.example.com"},
            headers=headers,
        )
        client.post(
            "/api/admin/providers",
            json={"name": "provider-b", "base_url": "https://b.example.com"},
            headers=headers,
        )

        resp = client.get("/api/admin/providers", headers=headers)
        assert resp.status_code == 200
        providers = resp.json()
        assert len(providers) == 2
        names = {p["name"] for p in providers}
        assert "provider-a" in names
        assert "provider-b" in names

    def test_update_provider(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}

        create_resp = client.post(
            "/api/admin/providers",
            json={"name": "update-me", "base_url": "https://old.url"},
            headers=headers,
        )
        pid = create_resp.json()["id"]

        resp = client.put(
            f"/api/admin/providers/{pid}",
            json={"base_url": "https://new.url", "is_active": False},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["base_url"] == "https://new.url"
        assert resp.json()["is_active"] is False

    def test_delete_provider(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}

        create_resp = client.post(
            "/api/admin/providers",
            json={"name": "delete-me", "base_url": "https://x.com"},
            headers=headers,
        )
        pid = create_resp.json()["id"]

        resp = client.delete(f"/api/admin/providers/{pid}", headers=headers)
        assert resp.status_code == 204

        # Verify it's gone
        list_resp = client.get("/api/admin/providers", headers=headers)
        assert all(p["id"] != pid for p in list_resp.json())

    def test_health_check(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}

        create_resp = client.post(
            "/api/admin/providers",
            json={"name": "health-target", "base_url": "https://hc.com"},
            headers=headers,
        )
        pid = create_resp.json()["id"]

        resp = client.post(
            f"/api/admin/providers/{pid}/health-check", headers=headers
        )
        assert resp.status_code == 200
        assert resp.json()["health_status"] == "healthy"

    def test_provider_not_found(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.put(
            "/api/admin/providers/9999",
            json={"name": "nope"},
            headers=headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Model CRUD
# ---------------------------------------------------------------------------


class TestModelCRUD:
    def test_create_model(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post(
            "/api/admin/models",
            json={
                "name": "gpt-4o",
                "display_name": "GPT-4o",
                "description": "OpenAI GPT-4o model",
                "category": "chat",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "gpt-4o"
        assert body["display_name"] == "GPT-4o"
        assert body["is_active"] is True

    def test_list_models(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        client.post(
            "/api/admin/models",
            json={"name": "model-1", "display_name": "Model 1"},
            headers=headers,
        )
        client.post(
            "/api/admin/models",
            json={"name": "model-2", "display_name": "Model 2"},
            headers=headers,
        )
        resp = client.get("/api/admin/models", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_update_model(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        create_resp = client.post(
            "/api/admin/models",
            json={"name": "upd-model", "display_name": "Old Name"},
            headers=headers,
        )
        mid = create_resp.json()["id"]

        resp = client.put(
            f"/api/admin/models/{mid}",
            json={"display_name": "New Name", "category": "embedding"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "New Name"
        assert resp.json()["category"] == "embedding"

    def test_delete_model(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        create_resp = client.post(
            "/api/admin/models",
            json={"name": "del-model", "display_name": "Del"},
            headers=headers,
        )
        mid = create_resp.json()["id"]

        resp = client.delete(f"/api/admin/models/{mid}", headers=headers)
        assert resp.status_code == 204

    def test_model_provider_mapping(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}

        # Create a provider and model
        p_resp = client.post(
            "/api/admin/providers",
            json={"name": "map-provider", "base_url": "https://map.com"},
            headers=headers,
        )
        pid = p_resp.json()["id"]

        m_resp = client.post(
            "/api/admin/models",
            json={"name": "map-model", "display_name": "Map Model"},
            headers=headers,
        )
        mid = m_resp.json()["id"]

        # Add provider mapping
        pm_resp = client.post(
            f"/api/admin/models/{mid}/providers",
            json={
                "provider_id": pid,
                "cost_input_per_1k": 0.01,
                "cost_output_per_1k": 0.02,
                "priority": 5,
            },
            headers=headers,
        )
        assert pm_resp.status_code == 201
        pm_body = pm_resp.json()
        assert pm_body["provider_id"] == pid
        assert pm_body["cost_input_per_1k"] == 0.01

        # Get provider mappings
        get_resp = client.get(
            f"/api/admin/models/{mid}/providers", headers=headers
        )
        assert get_resp.status_code == 200
        assert len(get_resp.json()) == 1


# ---------------------------------------------------------------------------
# Routing configuration
# ---------------------------------------------------------------------------


class TestRoutingConfig:
    def test_update_routing_creates_config(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}

        # Create a model first
        m_resp = client.post(
            "/api/admin/models",
            json={"name": "route-model", "display_name": "Route Model"},
            headers=headers,
        )
        mid = m_resp.json()["id"]

        resp = client.put(
            f"/api/admin/routing/{mid}",
            json={
                "strategy": "cheapest_first",
                "fallback_chain": [1, 2, 3],
                "rate_limit_rpm": 120,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["model_id"] == mid
        assert body["strategy"] == "cheapest_first"
        assert body["fallback_chain"] == [1, 2, 3]
        assert body["rate_limit_rpm"] == 120

    def test_update_routing_overwrites_existing(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}

        m_resp = client.post(
            "/api/admin/models",
            json={"name": "route-model-2", "display_name": "Route 2"},
            headers=headers,
        )
        mid = m_resp.json()["id"]

        # First create
        client.put(
            f"/api/admin/routing/{mid}",
            json={"strategy": "priority", "rate_limit_rpm": 60},
            headers=headers,
        )

        # Update
        resp = client.put(
            f"/api/admin/routing/{mid}",
            json={"strategy": "round_robin", "rate_limit_rpm": 100},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["strategy"] == "round_robin"
        assert resp.json()["rate_limit_rpm"] == 100

    def test_list_routing_configs(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}

        m_resp = client.post(
            "/api/admin/models",
            json={"name": "list-route", "display_name": "LR"},
            headers=headers,
        )
        mid = m_resp.json()["id"]

        client.put(
            f"/api/admin/routing/{mid}",
            json={"strategy": "latency_based"},
            headers=headers,
        )

        resp = client.get("/api/admin/routing", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------


class TestUserManagement:
    def _seed_user(self, client, token):
        """Register a regular user via the auth API."""
        client.post(
            "/api/auth/register",
            json={"username": "testuser", "password": "user-pass-123"},
        )

    def test_list_users_paginated(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        self._seed_user(client, token)

        resp = client.get("/api/admin/users?page=1&page_size=10", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert "total" in body
        assert "items" in body
        assert body["total"] >= 1
        assert body["page"] == 1

    def test_get_user_detail(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        self._seed_user(client, token)

        # Get user list to find user ID
        list_resp = client.get("/api/admin/users", headers=headers)
        users = list_resp.json()["items"]
        user_id = users[0]["id"]

        resp = client.get(f"/api/admin/users/{user_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["username"] == "testuser"

    def test_update_user_balance(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        self._seed_user(client, token)

        list_resp = client.get("/api/admin/users", headers=headers)
        user_id = list_resp.json()["items"][0]["id"]

        # Add balance
        resp = client.put(
            f"/api/admin/users/{user_id}/balance",
            json={"amount": 50.0, "reason": "admin top-up"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["balance"] == 50.0
        assert resp.json()["adjustment"] == 50.0

    def test_update_user_balance_cannot_go_negative(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        self._seed_user(client, token)

        list_resp = client.get("/api/admin/users", headers=headers)
        user_id = list_resp.json()["items"][0]["id"]

        resp = client.put(
            f"/api/admin/users/{user_id}/balance",
            json={"amount": -100.0, "reason": "over-deduct"},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_update_user_role(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        self._seed_user(client, token)

        list_resp = client.get("/api/admin/users", headers=headers)
        user_id = list_resp.json()["items"][0]["id"]

        resp = client.put(
            f"/api/admin/users/{user_id}/role",
            json={"role": "vip"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "vip"

    def test_update_user_role_invalid(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        self._seed_user(client, token)

        list_resp = client.get("/api/admin/users", headers=headers)
        user_id = list_resp.json()["items"][0]["id"]

        resp = client.put(
            f"/api/admin/users/{user_id}/role",
            json={"role": "supervillain"},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_user_not_found(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.get("/api/admin/users/9999", headers=headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Billing configuration
# ---------------------------------------------------------------------------


class TestBillingConfig:
    def test_get_billing_config_empty(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.get("/api/admin/billing/config", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_put_billing_config_creates_entries(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}

        resp = client.put(
            "/api/admin/billing/config",
            json=[
                {"key": "daily_free_credits", "value": "1.0"},
                {"key": "max_balance", "value": "1000.0"},
            ],
            headers=headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 2
        keys = {item["key"] for item in body}
        assert "daily_free_credits" in keys
        assert "max_balance" in keys

    def test_put_billing_config_upserts(self, admin_api):
        client, token = admin_api
        headers = {"Authorization": f"Bearer {token}"}

        # Create
        client.put(
            "/api/admin/billing/config",
            json=[{"key": "daily_free_credits", "value": "1.0"}],
            headers=headers,
        )

        # Update
        resp = client.put(
            "/api/admin/billing/config",
            json=[{"key": "daily_free_credits", "value": "2.5"}],
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()[0]["value"] == "2.5"

        # Verify via GET
        get_resp = client.get("/api/admin/billing/config", headers=headers)
        configs = get_resp.json()
        assert len(configs) == 1
        assert configs[0]["value"] == "2.5"


# ---------------------------------------------------------------------------
# Auth guard tests
# ---------------------------------------------------------------------------


class TestAdminGuard:
    def test_no_token_rejected(self, admin_api):
        client, _ = admin_api
        resp = client.get("/api/admin/providers")
        assert resp.status_code == 401

    def test_invalid_token_rejected(self, admin_api):
        client, _ = admin_api
        resp = client.get(
            "/api/admin/providers",
            headers={"Authorization": "Bearer invalid-token-xyz"},
        )
        assert resp.status_code == 401
