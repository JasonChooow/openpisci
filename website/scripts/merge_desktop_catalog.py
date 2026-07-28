#!/usr/bin/env python3
"""Merge the legacy 9xBot desktop marketplace catalog into the backend repository.

Source: ``9xBot/marketplace/index.json`` plus per-asset payloads under
``9xBot/marketplace/{experts,teams,skills}/``.

Each imported record is tagged ``source="github-legacy"`` so client-side
deduplication (in the desktop apps) keeps them alongside the official-catalog
seed without treating them as separate listings.

Usage::

    python scripts/merge_desktop_catalog.py \\
        --source ../marketplace \\
        --dry-run                # or --apply

The script talks directly to ``MarketplaceRepository`` — no HTTP call needed —
so it can be invoked during CI or during a first-time deploy.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

# Allow ``python scripts/merge_desktop_catalog.py`` from the repo root.
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.repository import (  # noqa: E402
    AssetIdError,
    ParsedAssetId,
    get_marketplace_repository,
    parse_asset_id,
)

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger("merge_desktop_catalog")


_DESKTOP_KIND_TO_DIR = {
    "expert": "experts",
    "team": "teams",
    "skill": "skills",
}


def _load_index(source_dir: Path) -> Dict[str, List[Dict[str, Any]]]:
    idx_path = source_dir / "index.json"
    if not idx_path.is_file():
        raise FileNotFoundError(f"missing {idx_path}")
    return json.loads(idx_path.read_text(encoding="utf-8"))


def _iter_entries(index: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    for group_key in ("experts", "teams", "skills"):
        for entry in index.get(group_key) or []:
            if isinstance(entry, dict) and entry.get("id"):
                yield entry


def _local_payload_path(source_dir: Path, parsed: ParsedAssetId) -> Optional[Path]:
    sub = _DESKTOP_KIND_TO_DIR.get(parsed.kind)
    if not sub:
        return None
    # experts/{slug}.json ; teams/{slug}.json ; skills/{slug}/manifest.json
    if parsed.kind in ("expert", "team"):
        p = source_dir / sub / f"{parsed.slug}.json"
        return p if p.is_file() else None
    if parsed.kind == "skill":
        p = source_dir / sub / parsed.slug / "manifest.json"
        return p if p.is_file() else None
    return None


def _payload_from_entry(source_dir: Path, entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Reconstruct a publishable payload for an index entry.

    Order of preference:

    1. Local file under ``experts/`` ``teams/`` ``skills/{slug}/manifest.json``.
    2. The index entry itself (name/description/download_url).
    """
    asset_id = str(entry.get("id") or "").strip()
    try:
        parsed = parse_asset_id(asset_id)
    except AssetIdError as e:
        logger.warning("skip %s: %s", asset_id, e)
        return None

    payload: Dict[str, Any]
    local = _local_payload_path(source_dir, parsed)
    if local is not None:
        try:
            payload = json.loads(local.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("failed to read %s: %s — falling back to index entry", local, e)
            payload = {}
    else:
        payload = {}

    # Fill missing fields from the catalog entry so search/index has something.
    payload.setdefault("id", asset_id)
    payload.setdefault("kind", parsed.kind)
    payload.setdefault("name", entry.get("name") or parsed.slug)
    payload.setdefault("description", entry.get("description") or "")
    if entry.get("download_url"):
        payload.setdefault("download_url", entry["download_url"])
    for k in ("tags", "featured", "trusted", "icon", "color"):
        if entry.get(k) is not None and payload.get(k) is None:
            payload[k] = entry[k]

    # Tag origin so client dedup keeps them alongside official-catalog seeds.
    payload["source"] = "github-legacy"
    return payload


async def _apply(payloads: List[Dict[str, Any]], *, publisher: str) -> int:
    repo = get_marketplace_repository()
    count = 0
    for p in payloads:
        try:
            await repo.publish(p, publisher=publisher)
            count += 1
        except Exception as e:
            logger.warning("publish failed for %s: %s", p.get("id"), e)
    return count


def _parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--source",
        default=str(Path(__file__).resolve().parents[2] / "marketplace"),
        help="Path to the legacy 9xBot marketplace directory (default: sibling marketplace/).",
    )
    parser.add_argument(
        "--publisher",
        default="github-legacy",
        help="Publisher tag recorded on merged assets.",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--dry-run", action="store_true", help="Report only; do not write.")
    group.add_argument("--apply", action="store_true", help="Persist into the repository.")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = _parse_args(argv)
    source_dir = Path(args.source).expanduser().resolve()
    if not source_dir.is_dir():
        logger.error("source directory does not exist: %s", source_dir)
        return 2

    index = _load_index(source_dir)
    payloads: List[Dict[str, Any]] = []
    for entry in _iter_entries(index):
        payload = _payload_from_entry(source_dir, entry)
        if payload is not None:
            payloads.append(payload)

    if not payloads:
        logger.info("no valid entries found under %s", source_dir)
        return 0

    kinds: Dict[str, int] = {}
    for p in payloads:
        kinds[p.get("kind", "?")] = kinds.get(p.get("kind", "?"), 0) + 1
    logger.info("prepared %d assets: %s", len(payloads), kinds)

    if not args.apply:
        for p in payloads[:5]:
            logger.info("  sample: %s (%s)", p.get("id"), p.get("name"))
        logger.info("dry run — pass --apply to persist")
        return 0

    imported = asyncio.run(_apply(payloads, publisher=args.publisher))
    logger.info("imported %d/%d assets", imported, len(payloads))
    return 0 if imported == len(payloads) else 1


if __name__ == "__main__":
    raise SystemExit(main())
