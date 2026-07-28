"""Platform compatibility for unified marketplace listings.

Ported verbatim from theAgentOS/core/marketplace/platform_compat.py; the module
has no external dependencies so it moves unchanged.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


SURFACES = frozenset({"web", "desktop"})
DESKTOP_OS = frozenset({"windows", "macos", "linux", "unknown"})


@dataclass
class PlatformCompat:
    surfaces: List[str] = field(default_factory=list)
    desktop_os: List[str] = field(default_factory=list)
    common: bool = False

    def to_dict(self) -> Dict[str, Any]:
        if self.common:
            return {"common": True}
        out: Dict[str, Any] = {}
        if self.surfaces:
            out["surfaces"] = list(self.surfaces)
        if self.desktop_os:
            out["desktop_os"] = list(self.desktop_os)
        if not out:
            return {"common": True}
        out.setdefault("common", False)
        return out

    @classmethod
    def from_dict(cls, raw: Any) -> "PlatformCompat":
        if not raw:
            return cls(common=True)
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                return cls(common=True)
        if not isinstance(raw, dict):
            return cls(common=True)
        if raw.get("common") is True:
            return cls(common=True)
        surfaces = [str(s).lower() for s in (raw.get("surfaces") or []) if str(s).strip()]
        desktop_os = [str(s).lower() for s in (raw.get("desktop_os") or []) if str(s).strip()]
        return cls(surfaces=surfaces, desktop_os=desktop_os, common=False)


@dataclass
class ClientProfile:
    surface: str = "web"
    os: str = "unknown"
    capabilities: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, raw: Any) -> Optional["ClientProfile"]:
        if not raw:
            return None
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                return None
        if not isinstance(raw, dict):
            return None
        surface = str(raw.get("surface") or "web").lower()
        os_name = str(raw.get("os") or "unknown").lower()
        caps = raw.get("capabilities") or []
        if not isinstance(caps, list):
            caps = []
        return cls(
            surface=surface,
            os=os_name,
            capabilities=[str(c).lower() for c in caps if str(c).strip()],
        )


def _payload_text(payload: Dict[str, Any]) -> str:
    parts = [
        str(payload.get("description") or ""),
        str(payload.get("name") or ""),
        " ".join(str(t) for t in (payload.get("tags") or [])),
        json.dumps(payload.get("tools") or [], ensure_ascii=False),
        json.dumps(payload.get("allowed_tools") or [], ensure_ascii=False),
    ]
    connector = payload.get("connector") or {}
    if isinstance(connector, dict):
        parts.append(json.dumps(connector, ensure_ascii=False))
    return " ".join(parts).lower()


def infer_compat_from_payload(kind: str, payload: Dict[str, Any]) -> PlatformCompat:
    kind = str(kind or "").lower()
    text = _payload_text(payload or {})
    cloud_only = bool(payload.get("cloud_only", kind in ("plugin", "tool")))

    if kind == "connector":
        connector = payload.get("connector") or payload
        transport = str(
            connector.get("transport") if isinstance(connector, dict) else "stdio"
        ).lower()
        if transport in ("sse", "http"):
            return PlatformCompat(surfaces=["web", "desktop"])
        return PlatformCompat(surfaces=["desktop"], desktop_os=["windows", "macos", "linux"])

    if cloud_only or kind in ("plugin", "tool"):
        if "slurm" in text or any(
            str(t).startswith("slurm_") for t in (payload.get("tools") or payload.get("allowed_tools") or [])
        ):
            return PlatformCompat(surfaces=["web"])
        return PlatformCompat(surfaces=["web"])

    if re.search(r"\b(com|ole|windows_only|windows-only)\b", text):
        return PlatformCompat(surfaces=["desktop"], desktop_os=["windows"])

    if "slurm" in text or any(
        str(t).startswith("slurm_") for t in (payload.get("tools") or payload.get("allowed_tools") or [])
    ):
        return PlatformCompat(surfaces=["web"])

    return PlatformCompat(common=True)


def infer_requires_capabilities(kind: str, payload: Dict[str, Any]) -> List[str]:
    text = _payload_text(payload or {})
    caps: List[str] = []
    if "slurm" in text or any(
        str(t).startswith("slurm_") for t in (payload.get("tools") or payload.get("allowed_tools") or [])
    ):
        caps.append("slurm")
    if re.search(r"\b(com|ole|windows_only)\b", text):
        caps.append("com")
    if kind == "connector":
        connector = payload.get("connector") or payload
        transport = str(
            connector.get("transport") if isinstance(connector, dict) else ""
        ).lower()
        if transport == "stdio":
            caps.append("mcp_stdio")
    return caps


def normalize_platform_compat(
    listing: Optional[Dict[str, Any]],
    payload: Optional[Dict[str, Any]],
) -> PlatformCompat:
    payload = payload or {}
    listing = listing or {}
    raw = payload.get("platform_compat") or listing.get("platform_compat")
    if raw:
        compat = PlatformCompat.from_dict(raw)
        if not compat.common or compat.surfaces or compat.desktop_os:
            return compat
    if payload.get("cloud_only") or listing.get("cloud_only"):
        return PlatformCompat(surfaces=["web"])
    kind = str(payload.get("kind") or listing.get("kind") or "")
    return infer_compat_from_payload(kind, payload)


def normalize_requires_capabilities(
    listing: Optional[Dict[str, Any]],
    payload: Optional[Dict[str, Any]],
) -> List[str]:
    payload = payload or {}
    listing = listing or {}
    raw = payload.get("requires_capabilities") or listing.get("requires_capabilities")
    if raw:
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = []
        if isinstance(raw, list) and raw:
            return [str(c).lower() for c in raw]
    kind = str(payload.get("kind") or listing.get("kind") or "")
    return infer_requires_capabilities(kind, payload)


def is_compatible(
    listing: Dict[str, Any],
    client_profile: Optional[ClientProfile],
    *,
    payload: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, Optional[str]]:
    if client_profile is None:
        return True, None

    compat = normalize_platform_compat(listing, payload or {})
    if compat.common:
        ok_caps, cap_reason = _check_capabilities(
            normalize_requires_capabilities(listing, payload or {}),
            client_profile,
        )
        return ok_caps, cap_reason

    surface = client_profile.surface.lower()
    if compat.surfaces and surface not in compat.surfaces:
        need = ", ".join(compat.surfaces)
        return False, f"需要运行环境: {need}（当前: {surface}）"

    if surface == "desktop" and compat.desktop_os:
        os_name = client_profile.os.lower()
        allowed = {o.lower() for o in compat.desktop_os}
        if os_name not in allowed and "unknown" not in allowed:
            need = ", ".join(compat.desktop_os)
            return False, f"需要桌面系统: {need}（当前: {os_name}）"

    return _check_capabilities(
        normalize_requires_capabilities(listing, payload or {}),
        client_profile,
    )


def _check_capabilities(
    required: List[str],
    client_profile: ClientProfile,
) -> Tuple[bool, Optional[str]]:
    if not required:
        return True, None
    have = set(client_profile.capabilities)
    missing = [c for c in required if c not in have]
    if missing:
        return False, f"缺少运行时能力: {', '.join(missing)}"
    return True, None


def enrich_summary(
    summary: Dict[str, Any],
    *,
    listing: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
    client_profile: Optional[ClientProfile] = None,
) -> Dict[str, Any]:
    listing = listing or summary
    compat = normalize_platform_compat(listing, payload or summary)
    requires = normalize_requires_capabilities(listing, payload or summary)
    out = dict(summary)
    out["platform_compat"] = compat.to_dict()
    out["requires_capabilities"] = requires
    ok, reason = is_compatible(listing, client_profile, payload=payload or summary)
    out["compatible"] = ok
    if not ok:
        out["incompatible_reason"] = reason
    return out


def filter_assets(
    assets: List[Dict[str, Any]],
    client_profile: Optional[ClientProfile],
    *,
    include_incompatible: bool = False,
) -> List[Dict[str, Any]]:
    if client_profile is None or include_incompatible:
        if client_profile is None:
            return [enrich_summary(a, client_profile=None) for a in assets]
        return [
            enrich_summary(a, client_profile=client_profile)
            for a in assets
        ]
    out: List[Dict[str, Any]] = []
    for a in assets:
        enriched = enrich_summary(a, client_profile=client_profile)
        if enriched.get("compatible", True):
            out.append(enriched)
    return out
