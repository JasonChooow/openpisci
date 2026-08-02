"""End-to-end HTTP API tests using FastAPI's TestClient."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(isolated_backend):
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c


def _dev_token(client: TestClient, username: str = "alice") -> str:
    resp = client.post(
        "/api/marketplace/_dev/token",
        json={"username": username},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def test_healthz(client: TestClient):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ── Public model catalog (/api/marketplace/models) ─────────────────────────


@pytest.fixture()
def models_client(isolated_backend, tmp_path, monkeypatch):
    """TestClient with a dedicated tmp sqlite DB seeded with providers/models."""
    import sqlite3

    import app.config as config
    import app.db as db

    db_path = tmp_path / "models-test.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    config._settings = None  # type: ignore[attr-defined]
    db.reset_db_cache()

    from app.main import create_app

    with TestClient(create_app()) as c:
        # Lifespan created the tables; seed rows through the raw file.
        conn = sqlite3.connect(db_path)
        conn.execute(
            "INSERT INTO llm_providers (name, base_url, api_key_encrypted, is_active, health_status, avg_latency_ms)"
            " VALUES ('openai-main', 'https://api.openai.com/v1', 'secret', 1, 'healthy', 120)"
        )
        conn.execute(
            "INSERT INTO llm_providers (name, base_url, api_key_encrypted, is_active, health_status, avg_latency_ms)"
            " VALUES ('disabled-p', 'https://x', 'secret', 0, 'unknown', 0)"
        )
        conn.execute(
            "INSERT INTO models (name, display_name, description, category, is_active)"
            " VALUES ('gpt-4o', 'GPT-4o', 'Flagship omni model', 'chat', 1)"
        )
        conn.execute(
            "INSERT INTO models (name, display_name, description, category, is_active)"
            " VALUES ('hidden-model', 'Hidden', 'should not appear', 'chat', 0)"
        )
        conn.execute(
            "INSERT INTO models (name, display_name, description, category, is_active)"
            " VALUES ('text-embedding-3', 'Embedding 3', 'Vectors', 'embedding', 1)"
        )
        conn.execute(
            "INSERT INTO provider_models (provider_id, model_id, cost_input_per_1k, cost_output_per_1k, priority, is_active)"
            " VALUES (1, 1, 0.03, 0.06, 0, 1)"
        )
        conn.execute(
            "INSERT INTO provider_models (provider_id, model_id, cost_input_per_1k, cost_output_per_1k, priority, is_active)"
            " VALUES (1, 3, 0.001, 0.001, 0, 1)"
        )
        # Model mapped to a disabled provider must not leak.
        conn.execute(
            "INSERT INTO provider_models (provider_id, model_id, cost_input_per_1k, cost_output_per_1k, priority, is_active)"
            " VALUES (2, 2, 0.01, 0.01, 0, 1)"
        )
        conn.commit()
        conn.close()
        yield c


def test_public_models_no_auth(models_client: TestClient):
    resp = models_client.get("/api/marketplace/models")
    assert resp.status_code == 200
    models = {m["id"]: m for m in resp.json()["models"]}
    assert "gpt-4o" in models
    assert "text-embedding-3" in models
    # inactive model and model only on disabled provider are hidden
    assert "hidden-model" not in models


def test_public_models_sanitized(models_client: TestClient):
    body = models_client.get("/api/marketplace/models").json()
    allowed = {"id", "display_name", "description", "category", "route_count", "pricing"}
    for m in body["models"]:
        assert set(m.keys()) == allowed
        assert "base_url" not in str(m).lower()
        assert "api_key" not in str(m).lower()
        assert "secret" not in str(m).lower()


def test_public_models_do_not_name_the_upstreams(models_client: TestClient):
    """上游是可替换的供应商。

    写在定价页上，一次换线就变成一次要通知用户的变更，议价空间也一并交出去了。
    运营侧要看这张映射表，走网关的 admin 接口。
    """
    body = models_client.get("/api/marketplace/models").json()
    rendered = str(body).lower()
    for vendor in ("openai", "anthropic", "bayesdl", "算龙头", "aiyuanbao", "中国移动"):
        assert vendor.lower() not in rendered, f"目录里泄露了上游 {vendor}"


def test_public_models_still_say_whether_there_is_a_fallback(models_client: TestClient):
    """访客真正想从供应商列表里得到的信息是「这个模型有没有备用线路」。

    条数说得了这件事，且不泄露任何东西。
    """
    body = models_client.get("/api/marketplace/models").json()
    assert all(m["route_count"] >= 1 for m in body["models"])


def test_public_models_category_filter(models_client: TestClient):
    body = models_client.get("/api/marketplace/models?category=embedding").json()
    assert [m["id"] for m in body["models"]] == ["text-embedding-3"]
    assert body["models"][0]["pricing"]["currency"] == "CNY"


def test_index_public(client: TestClient):
    resp = client.get("/api/marketplace/index")
    assert resp.status_code == 200
    body = resp.json()
    # bucket keys per get_index() contract
    for key in ("experts", "teams", "skills", "plugins"):
        assert key in body


def test_assets_flat_list(client: TestClient):
    resp = client.get("/api/marketplace/assets?kind=expert")
    assert resp.status_code == 200
    body = resp.json()
    assert "assets" in body
    assert all(a["kind"] == "expert" for a in body["assets"])


def test_asset_detail(client: TestClient):
    resp = client.get("/api/marketplace/asset/openpisci/expert/research-analyst@1.0.0")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "openpisci/expert/research-analyst@1.0.0"
    assert body["kind"] == "expert"


def test_asset_detail_missing(client: TestClient):
    resp = client.get("/api/marketplace/asset/nobody/expert/nope@1.0.0")
    assert resp.status_code == 404


def test_install_requires_auth(client: TestClient):
    resp = client.post(
        "/api/marketplace/install",
        json={"asset_id": "openpisci/expert/research-analyst@1.0.0"},
    )
    assert resp.status_code == 401


def test_install_then_installed(client: TestClient):
    token = _dev_token(client, "alice")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.post(
        "/api/marketplace/install",
        json={
            "asset_id": "openpisci/expert/research-analyst@1.0.0",
            "client_profile": {"surface": "web", "os": "linux", "capabilities": []},
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["installed"]["id"] == "openpisci/expert/research-analyst@1.0.0"

    resp2 = client.get("/api/marketplace/installed", headers=headers)
    assert resp2.status_code == 200
    ids = [it["id"] for it in resp2.json()["installed"]]
    assert "openpisci/expert/research-analyst@1.0.0" in ids


def test_publish_flow(client: TestClient):
    token = _dev_token(client, "publisher-bob")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "spec_version": 1,
        "id": "publisher-bob/expert/e2e@1.0.0",
        "kind": "expert",
        "name": "E2E",
        "description": "End-to-end test asset.",
        "system_prompt": "You are an E2E test.",
    }
    resp = client.post("/api/marketplace/publish", json={"payload": payload}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["published"]["id"] == payload["id"]

    # Fetch it back.
    detail = client.get(f"/api/marketplace/asset/{payload['id']}")
    assert detail.status_code == 200
    assert detail.json()["name"] == "E2E"


def test_publish_rejects_bad_id(client: TestClient):
    token = _dev_token(client, "publisher-bob")
    resp = client.post(
        "/api/marketplace/publish",
        json={"payload": {"id": "invalid", "kind": "expert"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


def test_phase2_endpoint_returns_501(client: TestClient):
    resp = client.get("/api/marketplace/search")
    assert resp.status_code == 501


def test_versions_endpoint(client: TestClient):
    token = _dev_token(client, "publisher-bob")
    headers = {"Authorization": f"Bearer {token}"}
    for v in ("1.0.0", "1.1.0"):
        client.post(
            "/api/marketplace/publish",
            json={
                "payload": {
                    "spec_version": 1,
                    "id": f"publisher-bob/skill/multi@{v}",
                    "kind": "skill",
                    "name": "Multi",
                    "description": "v" + v,
                    "path": "skills/multi",
                }
            },
            headers=headers,
        )
    resp = client.get("/api/marketplace/versions/publisher-bob/skill/multi")
    assert resp.status_code == 200
    versions = resp.json()["versions"]
    assert [v["version"] for v in versions] == ["1.1.0", "1.0.0"]
