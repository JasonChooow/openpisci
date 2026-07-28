"""Marketplace asset manifest HMAC signing.

Ported from theAgentOS/core/marketplace/manifest_signature.py; secret is
resolved from app config (``MARKET_SIGNING_SECRET``) instead of the theAgentOS
config manager.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any, Dict, Optional, Tuple

from ..config import get_settings

_ALGORITHM = "hmac-sha256"


def _signing_secret() -> Optional[str]:
    val = get_settings().signing_secret
    return val or None


def sign_payload(payload: Dict[str, Any]) -> Tuple[Optional[str], str]:
    """Return (signature_hex, algorithm). Signature is None when secret unset."""
    secret = _signing_secret()
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if not secret:
        return None, _ALGORITHM
    digest = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest, _ALGORITHM


def verify_payload(payload: Dict[str, Any], signature: Optional[str]) -> bool:
    if not signature:
        return True  # unsigned assets allowed (legacy / dev)
    secret = _signing_secret()
    if not secret:
        return True
    expected, _ = sign_payload(payload)
    return hmac.compare_digest(expected or "", signature)
