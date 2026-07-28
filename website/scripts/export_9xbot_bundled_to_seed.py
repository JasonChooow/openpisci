#!/usr/bin/env python3
"""Export 9xBot bundled items (qinchuang experts + skillhub skills) into cloud marketplace seed catalog.

Usage:
    python scripts/export_9xbot_bundled_to_seed.py [--out backend/seed/9xbot-bundled]

Produces:
    <out>/seed-manifest.json
    <out>/assets/<slug>.json  (one per expert / skill)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent  # 9xBot/
SRC_TAURI = REPO_ROOT / "src-tauri"
EXPERTS_JSON = SRC_TAURI / "src" / "builtin_qinchuang_experts.json"
SKILLHUB_DIR = SRC_TAURI / "builtin_skillhub"

DEFAULT_OUT = REPO_ROOT / "website" / "backend" / "seed" / "9xbot-bundled"
PUBLISHER = "9xbot"
SOURCE = "builtin-qinchuang"


def export_experts(out_assets: Path) -> int:
    """Convert builtin_qinchuang_experts.json → marketplace seed format."""
    if not EXPERTS_JSON.is_file():
        print(f"[WARN] experts json not found: {EXPERTS_JSON}", file=sys.stderr)
        return 0

    experts = json.loads(EXPERTS_JSON.read_text(encoding="utf-8"))
    count = 0
    for expert in experts:
        slug = expert["slug"]
        name = expert.get("name", slug)
        desc = expert.get("description", "")
        system_prompt = expert.get("system_prompt", "")
        icon = expert.get("icon", "🤖")
        color = expert.get("color", "#888")
        department = expert.get("department", "")
        subcategory = expert.get("subcategory", "")

        asset_id = f"{PUBLISHER}/expert/{slug}@1.0.0"
        payload = {
            "spec_version": 1,
            "id": asset_id,
            "kind": "expert",
            "name": name,
            "description": desc,
            "system_prompt": system_prompt,
            "icon": icon,
            "color": color,
            "tags": [SOURCE, department, subcategory],
            "source": SOURCE,
        }
        record = _wrap_record(asset_id, "expert", name, desc, payload)
        fname = _safe_filename(asset_id)
        (out_assets / fname).write_text(
            json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        count += 1
    return count


def export_skills(out_assets: Path) -> int:
    """Convert builtin_skillhub skills → marketplace seed format."""
    if not SKILLHUB_DIR.is_dir():
        print(f"[WARN] skillhub dir not found: {SKILLHUB_DIR}", file=sys.stderr)
        return 0

    count = 0
    for skill_dir in sorted(SKILLHUB_DIR.iterdir()):
        if not skill_dir.is_dir():
            continue
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.is_file():
            continue

        slug = skill_dir.name
        content = skill_md.read_text(encoding="utf-8")
        # Extract name from first markdown heading
        name = slug
        for line in content.splitlines():
            if line.startswith("# "):
                name = line[2:].strip()
                break

        # Extract description from first non-heading paragraph
        desc = ""
        in_heading = True
        for line in content.splitlines():
            if in_heading and line.startswith("#"):
                in_heading = False
                continue
            if not in_heading and line.strip():
                desc = line.strip()[:200]
                break

        asset_id = f"{PUBLISHER}/skill/{slug}@1.0.0"
        payload = {
            "spec_version": 1,
            "id": asset_id,
            "kind": "skill",
            "name": name,
            "description": desc,
            "path": f"skills/{slug}",
            "content": content,
            "tags": ["skillhub", "builtin"],
            "source": "builtin-skillhub",
        }
        record = _wrap_record(asset_id, "skill", name, desc, payload)
        fname = _safe_filename(asset_id)
        (out_assets / fname).write_text(
            json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        count += 1
    return count


def _wrap_record(
    asset_id: str, kind: str, name: str, desc: str, payload: dict
) -> dict:
    """Wrap payload into the standard seed record envelope."""
    parts = asset_id.rsplit("@", 1)
    version = parts[1] if len(parts) == 2 else "1.0.0"
    return {
        "id": asset_id,
        "kind": kind,
        "name": name,
        "description": desc,
        "version": version,
        "publisher": PUBLISHER,
        "paid": False,
        "price": 0,
        "cloud_only": False,
        "downloads": 0,
        "created_at": int(datetime.now(timezone.utc).timestamp()),
        "updated_at": int(datetime.now(timezone.utc).timestamp()),
        "uploaded_by": PUBLISHER,
        "payload": payload,
    }


def _safe_filename(asset_id: str) -> str:
    return asset_id.replace("/", "__").replace("@", "_at_") + ".json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    out: Path = args.out
    out_assets = out / "assets"
    out_assets.mkdir(parents=True, exist_ok=True)

    n_experts = export_experts(out_assets)
    n_skills = export_skills(out_assets)

    manifest = {
        "version": 1,
        "catalog_id": "9xbot-bundled",
        "publisher": PUBLISHER,
        "source": "9xBot builtin_qinchuang + builtin_skillhub",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counts": {"experts": n_experts, "skills": n_skills},
        "total": n_experts + n_skills,
    }
    (out / "seed-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Done: {n_experts} experts + {n_skills} skills → {out}")


if __name__ == "__main__":
    main()
