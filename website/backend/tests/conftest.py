"""Test fixtures for the marketplace backend."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Iterator

import pytest


@pytest.fixture()
def isolated_backend(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Provide a scratch storage root and reload backend state per test."""

    storage_root = tmp_path / "storage"
    monkeypatch.setenv("MARKET_STORAGE_ROOT", str(storage_root))
    monkeypatch.setenv("MARKET_JWT_SECRET", "test-secret")
    monkeypatch.setenv("MARKET_DEV_ENDPOINTS", "1")
    # Empty signing secret disables HMAC in tests unless an individual test
    # enables it explicitly via monkeypatch.
    monkeypatch.setenv("MARKET_SIGNING_SECRET", "")

    # Ensure the seed dir exists but is empty so tests control fixture data.
    empty_seed = tmp_path / "seed" / "official-catalog"
    (empty_seed / "assets").mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("MARKET_SEED_DIR", str(empty_seed))

    # Reset cached singletons so the new env vars take effect.
    import app.config as config
    import app.core.repository as repo_mod

    config._settings = None  # type: ignore[attr-defined]
    repo_mod.reset_repository_cache()

    yield storage_root

    # Purge any residual state.
    if storage_root.exists():
        shutil.rmtree(storage_root, ignore_errors=True)
    config._settings = None  # type: ignore[attr-defined]
    repo_mod.reset_repository_cache()
