"""File-backed marketplace repository.

Ported from theAgentOS/core/marketplace/marketplace_repository.py. The DB-backed
backend switch and its ``core.config.*`` dependencies are removed; this MVP
serves the file-JSON path only. Storage root comes from :mod:`app.config`.

Global asset id format: ``{publisher}/{kind}/{slug}@{semver}``
e.g. ``openpisci/expert/research-analyst@1.0.0``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Unified SKU kinds: expert / team / skill / plugin are runtime-installable;
# tool / scenario / biz / connector are additional catalog surfaces.
ASSET_KINDS = {"expert", "team", "skill", "plugin", "tool", "scenario", "biz", "connector"}
ASSET_ID_RE = re.compile(
    r"^[a-z0-9][a-z0-9-]*/(expert|team|skill|plugin|tool|scenario|biz|connector)/[a-z0-9][a-z0-9-]*@\d+\.\d+\.\d+$"
)


class AssetIdError(ValueError):
    """Raised when an asset id is malformed."""


@dataclass
class ParsedAssetId:
    publisher: str
    kind: str
    slug: str
    version: str

    @property
    def name_id(self) -> str:
        """Versionless identity: ``{publisher}/{kind}/{slug}``."""
        return f"{self.publisher}/{self.kind}/{self.slug}"


def parse_asset_id(asset_id: str) -> ParsedAssetId:
    raw = str(asset_id or "").strip()
    if not ASSET_ID_RE.match(raw):
        raise AssetIdError(
            f"非法资产 ID: {asset_id!r}；应为 {{publisher}}/{{kind}}/{{slug}}@{{semver}}"
        )
    left, version = raw.rsplit("@", 1)
    publisher, kind, slug = left.split("/", 2)
    return ParsedAssetId(publisher=publisher, kind=kind, slug=slug, version=version)


def _version_tuple(version: str) -> tuple:
    try:
        return tuple(int(x) for x in version.split("."))
    except Exception:
        return (0, 0, 0)


def _safe_filename(asset_id: str) -> str:
    return asset_id.replace("/", "__").replace("@", "_at_") + ".json"


# ── Minimal built-in seed (bootstraps a fresh deployment) ────────────────────
_SEED_ASSETS: List[Dict[str, Any]] = [
    {
        "spec_version": 1,
        "id": "openpisci/expert/research-analyst@1.0.0",
        "kind": "expert",
        "name": "调研分析师",
        "description": "擅长信息搜集、对比分析与报告撰写",
        "system_prompt": "You are a research analyst. Gather facts, compare options, and produce concise structured reports.",
        "icon": "🔍",
        "color": "#5b8def",
    },
    {
        "spec_version": 2,
        "id": "openpisci/team/content-squad@1.0.0",
        "kind": "team",
        "name": "内容小队",
        "description": "选题 + 创作 + 校对的标准内容团队",
        "org_spec": "# 内容小队\n\n选题 + 创作 + 校对发布\n",
        "members": [
            {
                "member_id": "planner", "role": "策划", "name": "内容策划",
                "description": "负责选题、受众分析与内容大纲",
                "system_prompt": "You are a content planner. Propose topics, audience angles, and structured outlines before writing starts.",
                "icon": "💡", "color": "#f59e0b",
                "source_id": "openpisci/expert/content-planner@1.0.0", "source_version": "1.0.0",
            },
            {
                "member_id": "writer", "role": "写作", "name": "内容写作者",
                "description": "根据大纲撰写成稿",
                "system_prompt": "You are a content writer. Turn outlines into clear, engaging drafts with consistent tone.",
                "icon": "✍️", "color": "#8b5cf6",
                "source_id": "openpisci/expert/content-writer@1.0.0", "source_version": "1.0.0",
            },
            {
                "member_id": "editor", "role": "校对", "name": "内容校对",
                "description": "润色、事实核对与发布前检查",
                "system_prompt": "You are a content editor. Polish prose, verify facts, and ensure publish-ready quality.",
                "icon": "✅", "color": "#10b981",
                "source_id": "openpisci/expert/content-editor@1.0.0", "source_version": "1.0.0",
            },
        ],
    },
    {
        "spec_version": 1,
        "id": "official/connector/demo-sse-mcp@1.0.0",
        "kind": "connector",
        "name": "Demo SSE MCP",
        "description": "示例 SSE 连接器（Web + Desktop 可装）",
        "connector": {
            "id": "demo-sse-mcp",
            "name": "Demo SSE MCP",
            "kind": "mcp",
            "transport": "sse",
            "url": "https://example.com/mcp/sse",
            "auth": {"method": "none", "fields": []},
            "enabled": False,
        },
        "platform_compat": {"surfaces": ["web", "desktop"]},
    },
    {
        "spec_version": 1,
        "id": "official/connector/demo-stdio-mcp@1.0.0",
        "kind": "connector",
        "name": "Demo Stdio MCP",
        "description": "示例 stdio 连接器（仅桌面可装）",
        "connector": {
            "id": "demo-stdio-mcp",
            "name": "Demo Stdio MCP",
            "kind": "mcp",
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-everything"],
            "auth": {"method": "none", "fields": []},
            "enabled": False,
        },
        "platform_compat": {
            "surfaces": ["desktop"],
            "desktop_os": ["windows", "macos", "linux"],
        },
        "requires_capabilities": ["mcp_stdio"],
    },
]


@dataclass
class MarketplaceRepository:
    base_dir: Path
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    @property
    def assets_dir(self) -> Path:
        return self.base_dir / "assets"

    @property
    def installs_dir(self) -> Path:
        return self.base_dir / "installs"

    def _ensure_dirs(self) -> None:
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        self.installs_dir.mkdir(parents=True, exist_ok=True)

    def _seed_if_empty(self) -> None:
        self._ensure_dirs()
        if any(self.assets_dir.glob("*.json")):
            self._import_official_catalog_seed_files()
            return
        for asset in _SEED_ASSETS:
            self._write_asset_file(asset, publisher="official")
        self._import_official_catalog_seed_files()

    def _import_official_catalog_seed_files(self) -> None:
        from .seed import import_official_catalog_seed_files, import_9xbot_bundled_seed_files

        import_official_catalog_seed_files(
            lambda payload, publisher="official": self._write_asset_file(payload, publisher=publisher),
            storage_marketplace_dir=self.base_dir,
        )
        import_9xbot_bundled_seed_files(
            lambda payload, publisher="9xbot": self._write_asset_file(payload, publisher=publisher),
            storage_marketplace_dir=self.base_dir,
        )

    def _write_asset_file(self, payload: Dict[str, Any], publisher: str) -> Dict[str, Any]:
        asset_id = str(payload.get("id") or "").strip()
        parsed = parse_asset_id(asset_id)
        now = int(time.time())
        record = {
            "id": asset_id,
            "kind": parsed.kind,
            "name": payload.get("name") or parsed.slug,
            "description": payload.get("description") or "",
            "version": parsed.version,
            "publisher": payload.get("publisher") or parsed.publisher,
            "paid": bool(payload.get("paid", False)),
            "price": int(payload.get("price", 0) or 0),
            # Plugins run as cloud-side tools; desktop can only enable them when
            # signed in — marked so the UI can label them.
            "cloud_only": bool(payload.get("cloud_only", parsed.kind == "plugin")),
            "downloads": int(payload.get("downloads", 0) or 0),
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
            "uploaded_by": publisher,
            "payload": payload,
        }
        path = self.assets_dir / _safe_filename(asset_id)
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        return record

    def _read_asset_file(self, asset_id: str) -> Optional[Dict[str, Any]]:
        path = self.assets_dir / _safe_filename(asset_id)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("[marketplace] 读取资产失败 %s: %s", asset_id, e)
            return None

    # ── Public API ────────────────────────────────────────────────────────────

    async def list_assets(
        self,
        kind: Optional[str] = None,
        *,
        client_profile=None,
        include_incompatible: bool = False,
        client_app: Optional[str] = None,
        channel: Optional[str] = None,  # accepted for API parity; unused in MVP
    ) -> List[Dict[str, Any]]:
        async with self._lock:
            self._seed_if_empty()
            records: Dict[str, Dict[str, Any]] = {}
            for path in self.assets_dir.glob("*.json"):
                try:
                    rec = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if kind and rec.get("kind") != kind:
                    continue
                try:
                    nid = parse_asset_id(rec["id"]).name_id
                except Exception:
                    nid = rec.get("id", path.stem)
                cur = records.get(nid)
                if cur is None or _version_tuple(rec.get("version", "0")) >= _version_tuple(cur.get("version", "0")):
                    records[nid] = rec
            out = [self._public_summary(r) for r in records.values()]
            out.sort(key=lambda r: (r.get("kind", ""), r.get("name", "")))
            if client_app:
                from .app_kinds import filter_assets_by_app

                out = filter_assets_by_app(out, client_app)
            if client_profile is not None:
                from .platform_compat import filter_assets

                out = filter_assets(out, client_profile, include_incompatible=include_incompatible)
            return out

    async def get_index(
        self,
        *,
        client_profile=None,
        include_incompatible: bool = False,
        client_app: Optional[str] = None,
        channel: Optional[str] = None,
    ) -> Dict[str, List[Dict[str, Any]]]:
        assets = await self.list_assets(
            client_profile=client_profile,
            include_incompatible=include_incompatible,
            client_app=client_app,
        )
        index: Dict[str, List[Dict[str, Any]]] = {"experts": [], "teams": [], "skills": [], "plugins": []}
        bucket = {
            "expert": "experts",
            "team": "teams",
            "skill": "skills",
            "plugin": "plugins",
            "tool": "tools",
            "scenario": "scenarios",
            "biz": "biz_packages",
            "connector": "connectors",
        }
        for a in assets:
            key = bucket.get(a.get("kind", ""))
            if key:
                index.setdefault(key, []).append(a)
        return index

    async def get_asset(self, asset_id: str) -> Optional[Dict[str, Any]]:
        async with self._lock:
            self._seed_if_empty()
            return self._read_asset_file(asset_id)

    async def get_asset_payload(self, asset_id: str) -> Optional[Dict[str, Any]]:
        rec = await self.get_asset(asset_id)
        return (rec or {}).get("payload") if rec else None

    async def publish(self, payload: Dict[str, Any], publisher: str) -> Dict[str, Any]:
        from .publish_validator import validate_publish_payload

        payload, _warnings = validate_publish_payload(dict(payload))
        async with self._lock:
            self._ensure_dirs()
            return self._public_summary(self._write_asset_file(payload, publisher))

    async def record_install(self, username: str, asset_id: str) -> Dict[str, Any]:
        parse_asset_id(asset_id)  # validate
        async with self._lock:
            self._ensure_dirs()
            path = self.installs_dir / f"{_sanitize_user(username)}.json"
            installs: List[Dict[str, Any]] = []
            if path.exists():
                try:
                    installs = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    installs = []
            installs = [i for i in installs if i.get("id") != asset_id]
            entry = {"id": asset_id, "installed_at": int(time.time())}
            installs.append(entry)
            path.write_text(json.dumps(installs, ensure_ascii=False, indent=2), encoding="utf-8")
            rec = self._read_asset_file(asset_id)
            if rec is not None:
                rec["downloads"] = int(rec.get("downloads", 0) or 0) + 1
                (self.assets_dir / _safe_filename(asset_id)).write_text(
                    json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8"
                )
            return entry

    async def uninstall(self, username: str, asset_id: str) -> bool:
        async with self._lock:
            path = self.installs_dir / f"{_sanitize_user(username)}.json"
            if not path.exists():
                return False
            try:
                installs = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return False
            new_list = [i for i in installs if i.get("id") != asset_id]
            if len(new_list) == len(installs):
                return False
            path.write_text(json.dumps(new_list, ensure_ascii=False, indent=2), encoding="utf-8")
            return True

    async def list_installed(self, username: str) -> List[Dict[str, Any]]:
        async with self._lock:
            path = self.installs_dir / f"{_sanitize_user(username)}.json"
            if not path.exists():
                return []
            try:
                installs = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return []
            out = []
            for i in installs:
                rec = self._read_asset_file(i.get("id", ""))
                if rec:
                    summary = self._public_summary(rec)
                    summary["installed_at"] = i.get("installed_at")
                    out.append(summary)
            return out

    async def list_versions(self, identity: str) -> List[Dict[str, Any]]:
        """Return version history for a listing (versionless id or full asset id)."""
        async with self._lock:
            self._ensure_dirs()
            # Normalize identity to versionless name-id.
            base = identity
            if "@" in identity:
                try:
                    base = parse_asset_id(identity).name_id
                except Exception:
                    pass
            versions: List[Dict[str, Any]] = []
            for path in self.assets_dir.glob("*.json"):
                try:
                    rec = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    continue
                try:
                    parsed = parse_asset_id(rec.get("id", ""))
                except Exception:
                    continue
                if parsed.name_id != base:
                    continue
                versions.append(
                    {
                        "id": rec.get("id"),
                        "version": rec.get("version"),
                        "updated_at": rec.get("updated_at"),
                        "publisher": rec.get("publisher"),
                    }
                )
            versions.sort(key=lambda v: _version_tuple(v.get("version", "0")), reverse=True)
            return versions

    async def get_latest_asset_id(self, identity: str) -> Optional[str]:
        versions = await self.list_versions(identity)
        return versions[0]["id"] if versions else None

    async def get_lineage(self, asset_id: str) -> Dict[str, Any]:
        parse_asset_id(asset_id)  # validate
        ancestors: List[str] = []
        children: List[str] = []
        async with self._lock:
            self._ensure_dirs()
            rec = self._read_asset_file(asset_id)
            if rec:
                parent = rec.get("parent_asset_id")
                if parent:
                    ancestors.append(str(parent))
            if self.assets_dir.exists():
                for path in self.assets_dir.glob("*.json"):
                    try:
                        data = json.loads(path.read_text(encoding="utf-8"))
                    except Exception:
                        continue
                    parent_ref = data.get("parent_asset_id")
                    if parent_ref in (asset_id, rec.get("id") if rec else None):
                        cid = data.get("id")
                        if cid:
                            children.append(str(cid))
        return {"asset_id": asset_id, "ancestors": ancestors, "children": children}

    @staticmethod
    def _public_summary(rec: Dict[str, Any]) -> Dict[str, Any]:
        payload = rec.get("payload") or rec
        from .platform_compat import normalize_platform_compat, normalize_requires_capabilities

        compat = normalize_platform_compat(rec, payload)
        requires = normalize_requires_capabilities(rec, payload)
        summary = {
            "id": rec.get("id"),
            "kind": rec.get("kind"),
            "name": rec.get("name"),
            "description": rec.get("description"),
            "version": rec.get("version"),
            "publisher": rec.get("publisher"),
            "paid": bool(rec.get("paid", False)),
            "price": int(rec.get("price", 0) or 0),
            "cloud_only": bool(rec.get("cloud_only", False)),
            "downloads": int(rec.get("downloads", 0) or 0),
            "updated_at": rec.get("updated_at"),
            "platform_compat": compat.to_dict(),
            "requires_capabilities": requires,
        }
        # Copy through common promotional fields when present on the payload.
        for opt_key in ("tags", "featured", "trusted", "icon", "color", "source"):
            if payload.get(opt_key) is not None:
                summary[opt_key] = payload.get(opt_key)
        if rec.get("kind") == "biz":
            pkg_id = str((payload or {}).get("package_id") or "").strip()
            if pkg_id:
                summary["package_id"] = pkg_id
        return summary


def _sanitize_user(username: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", str(username or "anonymous"))


_repo: Optional[MarketplaceRepository] = None


def get_marketplace_repository() -> MarketplaceRepository:
    """Return the singleton file-backed marketplace repository."""
    global _repo
    if _repo is None:
        from ..config import get_settings

        base = get_settings().market_storage_root
        _repo = MarketplaceRepository(base_dir=base)
    return _repo


def reset_repository_cache() -> None:
    """Reset the module-level singleton (test-only)."""
    global _repo
    _repo = None
