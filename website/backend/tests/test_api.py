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
