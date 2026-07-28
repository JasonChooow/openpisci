"""Import marketplace catalog seed files.

Ported from theAgentOS/core/marketplace/official_catalog_seed.py. The seed root
is resolved via :mod:`app.config` so it can be overridden with the
``MARKET_SEED_DIR`` environment variable.

Supports multiple catalogs: official-catalog + 9xbot-bundled.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

_MARKER_NAME = ".official_catalog_seed_version"
_LEGACY_MARKER = ".agentz_preinstall_seed_version"
_9XBOT_MARKER = ".9xbot_bundled_seed_version"


def official_catalog_seed_dir() -> Path:
    from ..config import get_settings

    return get_settings().seed_dir


def _9xbot_bundled_seed_dir() -> Path:
    """Sibling catalog: seed/9xbot-bundled."""
    return official_catalog_seed_dir().parent / "9xbot-bundled"


def _marker_path(storage_marketplace_dir: Path) -> Path:
    return storage_marketplace_dir / _MARKER_NAME


def _read_seed_manifest() -> Optional[Dict[str, Any]]:
    path = official_catalog_seed_dir() / "seed-manifest.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("[marketplace] 读取 official-catalog seed-manifest 失败: %s", e)
        return None


def import_official_catalog_seed_files(
    write_asset: Callable[[Dict[str, Any], str], Any],
    *,
    storage_marketplace_dir: Path,
    force: bool = False,
) -> int:
    """Copy official-catalog seed JSON into the repository assets dir.

    ``write_asset(payload, publisher)`` is a callback provided by the repository
    (usually ``lambda p, publisher="official": repo._write_asset_file(...)``).
    Returns the number of imported records.
    """
    manifest = _read_seed_manifest()
    if not manifest:
        return 0

    target_version = str(manifest.get("version", "0"))
    marker = _marker_path(storage_marketplace_dir)
    if not force and marker.is_file():
        try:
            if marker.read_text(encoding="utf-8").strip() == target_version:
                return 0
        except Exception:
            pass

    assets_dir = official_catalog_seed_dir() / "assets"
    if not assets_dir.is_dir():
        return 0

    imported = 0
    for path in sorted(assets_dir.glob("*.json")):
        try:
            rec = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("[marketplace] 跳过无效 seed 文件 %s: %s", path.name, e)
            continue
        payload = rec.get("payload") or rec
        try:
            write_asset(payload, "official")
            imported += 1
        except Exception as e:
            logger.warning("[marketplace] official-catalog 写入失败 %s: %s", path.name, e)

    storage_marketplace_dir.mkdir(parents=True, exist_ok=True)
    marker.write_text(target_version, encoding="utf-8")
    legacy = storage_marketplace_dir / _LEGACY_MARKER
    if legacy.is_file():
        try:
            legacy.unlink()
        except Exception:
            pass
    if imported:
        logger.info(
            "[marketplace] 官方目录种子（文件库）导入: %d version=%s",
            imported,
            target_version,
        )
    return imported


def import_9xbot_bundled_seed_files(
    write_asset: Callable[[Dict[str, Any], str], Any],
    *,
    storage_marketplace_dir: Path,
    force: bool = False,
) -> int:
    """Import 9xBot bundled experts/skills (qinchuang + skillhub) as seed."""
    seed_dir = _9xbot_bundled_seed_dir()
    manifest_path = seed_dir / "seed-manifest.json"
    if not manifest_path.is_file():
        return 0

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("[marketplace] 读取 9xbot-bundled seed-manifest 失败: %s", e)
        return 0

    target_version = str(manifest.get("version", "0"))
    marker = storage_marketplace_dir / _9XBOT_MARKER
    if not force and marker.is_file():
        try:
            if marker.read_text(encoding="utf-8").strip() == target_version:
                return 0
        except Exception:
            pass

    assets_dir = seed_dir / "assets"
    if not assets_dir.is_dir():
        return 0

    imported = 0
    for path in sorted(assets_dir.glob("*.json")):
        try:
            rec = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("[marketplace] 跳过无效 9xbot seed 文件 %s: %s", path.name, e)
            continue
        payload = rec.get("payload") or rec
        try:
            write_asset(payload, "9xbot")
            imported += 1
        except Exception as e:
            logger.warning("[marketplace] 9xbot-bundled 写入失败 %s: %s", path.name, e)

    storage_marketplace_dir.mkdir(parents=True, exist_ok=True)
    marker.write_text(target_version, encoding="utf-8")
    if imported:
        logger.info(
            "[marketplace] 9xBot 预装目录种子导入: %d version=%s",
            imported,
            target_version,
        )
    return imported
