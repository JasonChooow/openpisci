"""Repository-level unit tests."""

from __future__ import annotations

import pytest

from app.core.repository import (
    AssetIdError,
    get_marketplace_repository,
    parse_asset_id,
)


def test_parse_asset_id_valid():
    parsed = parse_asset_id("openpisci/expert/research-analyst@1.0.0")
    assert parsed.publisher == "openpisci"
    assert parsed.kind == "expert"
    assert parsed.slug == "research-analyst"
    assert parsed.version == "1.0.0"
    assert parsed.name_id == "openpisci/expert/research-analyst"


@pytest.mark.parametrize(
    "bad_id",
    [
        "",
        "just-a-name",
        "openpisci/unknown/x@1.0.0",
        "openpisci/expert/x@1.0",
        "OPENPISCI/expert/x@1.0.0",
    ],
)
def test_parse_asset_id_rejects_malformed(bad_id):
    with pytest.raises(AssetIdError):
        parse_asset_id(bad_id)


async def test_seed_and_list_assets(isolated_backend):
    repo = get_marketplace_repository()
    assets = await repo.list_assets()
    # Built-in seed contains at least 1 expert + 1 team + 2 connectors.
    kinds = {a["kind"] for a in assets}
    assert "expert" in kinds
    assert "team" in kinds
    assert "connector" in kinds


async def test_publish_and_get_asset(isolated_backend):
    repo = get_marketplace_repository()
    payload = {
        "spec_version": 1,
        "id": "test-pub/expert/hello@1.0.0",
        "kind": "expert",
        "name": "Hello",
        "description": "Say hi.",
        "system_prompt": "You are a friendly greeter.",
    }
    summary = await repo.publish(payload, publisher="test-pub")
    assert summary["id"] == payload["id"]
    assert summary["publisher"] == "test-pub"

    record = await repo.get_asset(payload["id"])
    assert record is not None
    assert record["payload"]["name"] == "Hello"


async def test_install_flow(isolated_backend):
    repo = get_marketplace_repository()
    payload = {
        "spec_version": 1,
        "id": "test-pub/skill/sample@1.0.0",
        "kind": "skill",
        "name": "Sample Skill",
        "description": "A test skill.",
        "path": "skills/sample",
    }
    await repo.publish(payload, publisher="test-pub")

    entry = await repo.record_install("alice", payload["id"])
    assert entry["id"] == payload["id"]

    installed = await repo.list_installed("alice")
    ids = [item["id"] for item in installed]
    assert payload["id"] in ids

    # Uninstall removes the entry.
    ok = await repo.uninstall("alice", payload["id"])
    assert ok is True
    installed2 = await repo.list_installed("alice")
    assert payload["id"] not in [item["id"] for item in installed2]


async def test_list_versions_and_latest(isolated_backend):
    repo = get_marketplace_repository()
    base_id = "test-pub/expert/versioned"
    for v in ("1.0.0", "1.2.0", "1.1.0"):
        await repo.publish(
            {
                "spec_version": 1,
                "id": f"{base_id}@{v}",
                "kind": "expert",
                "name": "Versioned",
                "description": f"v{v}",
                "system_prompt": "x",
            },
            publisher="test-pub",
        )
    versions = await repo.list_versions(base_id)
    assert [v["version"] for v in versions] == ["1.2.0", "1.1.0", "1.0.0"]
    latest = await repo.get_latest_asset_id(base_id)
    assert latest == f"{base_id}@1.2.0"
