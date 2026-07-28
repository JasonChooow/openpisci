"""Per-client-app SKU visibility for the unified marketplace.

Extracted verbatim from theAgentOS. The whitelist here is the single source of
truth for which asset kinds each consuming application can render.
"""

from __future__ import annotations

from typing import Any, Dict, FrozenSet, List, Optional

from .repository import ASSET_KINDS

# Canonical client app identifiers (passed as ?client_app=).
APP_THEAGENTOS_WEB = "theagentos-web"
APP_OPENPISCI = "openpisci"
APP_AGENTZ = "agentz"
APP_OPENPISCIS = "openpiscis"
APP_9XBOT = "9xbot"
APP_DIMWORK = "dimwork"

# kind whitelist per client app. ``theagentos-web`` sees every kind.
_APP_KIND_WHITELIST: Dict[str, FrozenSet[str]] = {
    APP_THEAGENTOS_WEB: frozenset(ASSET_KINDS),
    APP_OPENPISCI: frozenset({"expert", "team", "skill", "connector"}),
    APP_AGENTZ: frozenset({"expert", "team", "skill", "tool", "connector"}),
    APP_OPENPISCIS: frozenset({"expert", "team", "skill", "connector"}),
    APP_9XBOT: frozenset({"expert", "team", "skill", "connector"}),
    APP_DIMWORK: frozenset({"expert", "team", "skill", "connector"}),
}

# Aliases so clients can pass a few common spellings.
_APP_ALIASES: Dict[str, str] = {
    "web": APP_THEAGENTOS_WEB,
    "theagentos": APP_THEAGENTOS_WEB,
    "theagentos_web": APP_THEAGENTOS_WEB,
    "agent-z": APP_AGENTZ,
    "agent_z": APP_AGENTZ,
    "open-pisci": APP_OPENPISCI,
    "open-piscis": APP_OPENPISCIS,
    "9x-bot": APP_9XBOT,
    "9x_bot": APP_9XBOT,
    "dim-work": APP_DIMWORK,
    "dim_work": APP_DIMWORK,
}


def normalize_client_app(client_app: Optional[str]) -> Optional[str]:
    if not client_app:
        return None
    key = str(client_app).strip().lower()
    if not key:
        return None
    key = _APP_ALIASES.get(key, key)
    return key if key in _APP_KIND_WHITELIST else None


def allowed_kinds_for_app(client_app: Optional[str]) -> Optional[FrozenSet[str]]:
    app = normalize_client_app(client_app)
    if app is None:
        return None
    return _APP_KIND_WHITELIST[app]


def is_kind_allowed_for_app(kind: str, client_app: Optional[str]) -> bool:
    allowed = allowed_kinds_for_app(client_app)
    if allowed is None:
        return True
    return str(kind or "").lower() in allowed


def filter_assets_by_app(
    assets: List[Dict[str, Any]],
    client_app: Optional[str],
) -> List[Dict[str, Any]]:
    allowed = allowed_kinds_for_app(client_app)
    if allowed is None:
        return assets
    return [a for a in assets if str(a.get("kind") or "").lower() in allowed]
