"""Marketplace publish validation (ported from theAgentOS)."""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .platform_compat import (
    infer_compat_from_payload,
    infer_requires_capabilities,
    normalize_platform_compat,
)
from .repository import ASSET_KINDS, AssetIdError, parse_asset_id

logger = logging.getLogger(__name__)

_CREDENTIAL_KEYS = frozenset(
    {"credentials", "password", "secret", "api_key", "access_token", "refresh_token"}
)

# Optional JSON Schema validation. When the ``jsonschema`` package is available
# and the corresponding schema exists on disk, publish payloads are validated
# per-kind. Missing package or missing schema is treated as skip (dev-friendly).
_KIND_TO_SCHEMA = {
    "expert": "expert-pack.v1.schema.json",
    "team": "team-template.v2.schema.json",
    "skill": "skill-pack.v1.schema.json",
    "connector": "connector-pack.v1.schema.json",
}


@lru_cache(maxsize=None)
def _load_schema(name: str) -> Any:
    from ..config import get_settings

    path: Path = get_settings().schema_dir / name
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("[marketplace] failed to load schema %s: %s", name, e)
        return None


def _validate_against_schema(kind: str, payload: Dict[str, Any]) -> None:
    schema_name = _KIND_TO_SCHEMA.get(kind)
    if not schema_name:
        return
    schema = _load_schema(schema_name)
    if not schema:
        return
    try:
        import jsonschema  # type: ignore
    except ImportError:
        return
    try:
        jsonschema.validate(payload, schema)
    except jsonschema.ValidationError as e:  # type: ignore[attr-defined]
        raise ValueError(f"发布包不符合 {kind} schema: {e.message}") from e


def validate_publish_payload(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Return normalized payload and non-fatal warnings."""
    warnings: List[str] = []
    asset_id = str(payload.get("id") or "").strip()
    if not asset_id:
        raise ValueError("缺少资产 id")
    try:
        parsed = parse_asset_id(asset_id)
    except AssetIdError as e:
        raise ValueError(str(e)) from e

    if parsed.kind not in ASSET_KINDS:
        raise ValueError(f"不支持的 kind: {parsed.kind}")

    _reject_embedded_credentials(payload)

    if parsed.kind == "connector":
        _validate_connector_payload(payload)

    compat = normalize_platform_compat(None, payload)
    if not payload.get("platform_compat"):
        payload["platform_compat"] = compat.to_dict()

    if not payload.get("requires_capabilities"):
        payload["requires_capabilities"] = infer_requires_capabilities(parsed.kind, payload)

    if payload.get("cloud_only") and not payload.get("platform_compat"):
        payload["platform_compat"] = infer_compat_from_payload(parsed.kind, payload).to_dict()

    payload.setdefault("kind", parsed.kind)

    _validate_against_schema(parsed.kind, payload)

    return payload, warnings


def _reject_embedded_credentials(obj: Any, path: str = "") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            key_lower = str(k).lower()
            if key_lower in _CREDENTIAL_KEYS and v not in (None, "", [], {}):
                raise ValueError(f"发布包不得包含用户凭证字段: {path}.{k}" if path else k)
            _reject_embedded_credentials(v, f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _reject_embedded_credentials(item, f"{path}[{i}]")


def _validate_connector_payload(payload: Dict[str, Any]) -> None:
    connector = payload.get("connector") or payload
    if not isinstance(connector, dict):
        raise ValueError("connector 类型缺少 connector manifest 对象")
    cid = str(connector.get("id") or payload.get("slug") or "").strip()
    if not cid:
        raise ValueError("connector manifest 缺少 id")
    transport = str(connector.get("transport") or "stdio").lower()
    if transport not in ("stdio", "sse", "http"):
        raise ValueError(f"不支持的 transport: {transport}")
    if transport == "stdio" and not str(connector.get("command") or "").strip():
        raise ValueError("stdio connector 需要 command")
    if transport in ("sse", "http") and not str(connector.get("url") or "").strip():
        raise ValueError(f"{transport} connector 需要 url")
