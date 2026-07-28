"""Parse client_profile from FastAPI query/body."""

from __future__ import annotations

import base64
from typing import Any, Optional

from .platform_compat import ClientProfile


def parse_client_profile(
    client_profile: Optional[str] = None,
    surface: Optional[str] = None,
    os: Optional[str] = None,
    capabilities: Optional[str] = None,
) -> Optional[ClientProfile]:
    """Build ClientProfile from JSON string or discrete query params."""
    if client_profile:
        raw = client_profile.strip()
        if raw.startswith("{"):
            return ClientProfile.from_dict(raw)
        try:
            decoded = base64.urlsafe_b64decode(raw + "==").decode("utf-8")
            return ClientProfile.from_dict(decoded)
        except Exception:
            return ClientProfile.from_dict(raw)

    if surface or os or capabilities:
        caps: list[str] = []
        if capabilities:
            caps = [c.strip() for c in capabilities.split(",") if c.strip()]
        return ClientProfile(
            surface=(surface or "web").lower(),
            os=(os or "unknown").lower(),
            capabilities=[c.lower() for c in caps],
        )
    return None


def default_web_client_profile(*, hpc_enabled: bool = True) -> ClientProfile:
    caps = ["slurm"] if hpc_enabled else []
    return ClientProfile(surface="web", os="unknown", capabilities=caps)


def parse_client_profile_body(body: Any) -> Optional[ClientProfile]:
    if body is None:
        return None
    if isinstance(body, dict):
        return ClientProfile.from_dict(body)
    return None
