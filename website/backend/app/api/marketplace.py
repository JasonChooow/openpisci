"""Unified Marketplace API — extracted from theAgentOS.

Route paths are byte-identical with ``theAgentOS/web-ui/backend/api/marketplace.py``
so all 4 desktop clients (9xBot / DimWork / openpiscis / AgentZ) and the
theAgentOS web UI work unchanged when pointed at this backend.

MVP surface (matches Task 4 in the plan):

* ``GET  /api/marketplace/index``       public catalog grouped by kind
* ``GET  /api/marketplace/assets``      flat list, optional ``?kind=``
* ``GET  /api/marketplace/asset/{id}``  installable package payload
* ``POST /api/marketplace/install``     record install (auth)
* ``GET  /api/marketplace/installed``   current user's installs (auth)
* ``POST /api/marketplace/publish``     publish/update an asset (auth)
* ``GET  /api/marketplace/versions/{identity}``
* ``POST /api/marketplace/upgrade``
* ``GET  /api/marketplace/lineage/{asset_id}``
* ``POST /api/marketplace/_dev/token``  (dev-only) issue an HS256 token
* ``POST /api/marketplace/uninstall``   remove an install

Trading (``/purchase``, ``/refund``, ``/my/*``), skill-evolution, and
engagement/discipline are deferred to Phase 2 per the plan.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth.deps import require_username
from ..auth.jwt import issue_token
from ..config import get_settings
from ..core import app_kinds, client_profile as client_profile_mod, platform_compat
from ..core.repository import (
    AssetIdError,
    get_marketplace_repository,
    parse_asset_id,
)
from ..core.signature import verify_payload as verify_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


# ── Request models ──────────────────────────────────────────────────────────

class InstallRequest(BaseModel):
    asset_id: str
    team_id: Optional[str] = None
    materialize: bool = True
    client_profile: Optional[Dict[str, Any]] = None


class UninstallRequest(BaseModel):
    asset_id: str


class UpgradeRequest(BaseModel):
    identity: str  # listing_id (versionless) or full asset id
    team_id: Optional[str] = None
    materialize: bool = True


class PublishRequest(BaseModel):
    payload: Dict[str, Any]


class DevTokenRequest(BaseModel):
    username: str
    ttl_seconds: Optional[int] = None


# ── Helpers ─────────────────────────────────────────────────────────────────

def _repo():
    return get_marketplace_repository()


def _resolve_client_profile(
    client_profile: Optional[str],
    surface: Optional[str],
    os: Optional[str],
    capabilities: Optional[str],
):
    return client_profile_mod.parse_client_profile(client_profile, surface, os, capabilities)


def _filter_products_by_app(
    products: List[Dict[str, Any]],
    client_app: Optional[str],
) -> List[Dict[str, Any]]:
    if not client_app or not isinstance(products, list):
        return products
    return app_kinds.filter_assets_by_app(products, client_app)


# ── Public catalog ──────────────────────────────────────────────────────────

@router.get("/index")
async def get_index(
    client_profile: Optional[str] = Query(default=None),
    surface: Optional[str] = Query(default=None),
    os: Optional[str] = Query(default=None),
    capabilities: Optional[str] = Query(default=None),
    client_app: Optional[str] = Query(default=None),
    channel: str = Query(default="stable"),
    include_incompatible: bool = Query(default=False),
):
    profile = _resolve_client_profile(client_profile, surface, os, capabilities)
    return await _repo().get_index(
        client_profile=profile,
        include_incompatible=include_incompatible,
        client_app=client_app,
        channel=channel,
    )


@router.get("/assets")
async def list_assets(
    kind: Optional[str] = Query(default=None),
    client_profile: Optional[str] = Query(default=None),
    surface: Optional[str] = Query(default=None),
    os: Optional[str] = Query(default=None),
    capabilities: Optional[str] = Query(default=None),
    client_app: Optional[str] = Query(default=None),
    channel: str = Query(default="stable"),
    include_incompatible: bool = Query(default=False),
):
    profile = _resolve_client_profile(client_profile, surface, os, capabilities)
    assets = await _repo().list_assets(
        kind,
        client_profile=profile,
        include_incompatible=include_incompatible,
        client_app=client_app,
        channel=channel,
    )
    return {"assets": assets}


@router.get("/asset/{asset_id:path}")
async def get_asset(asset_id: str):
    rec = await _repo().get_asset(asset_id)
    if not rec:
        raise HTTPException(status_code=404, detail="资产不存在")
    payload = rec.get("payload") or rec
    signature = rec.get("signature")
    if signature:
        if not verify_signature(payload if isinstance(payload, dict) else {}, signature):
            raise HTTPException(status_code=409, detail="资产签名校验失败")
    body = dict(payload) if isinstance(payload, dict) else payload
    if isinstance(body, dict):
        body.setdefault("download_url", rec.get("download_url"))
        body.setdefault("channel", rec.get("channel"))
        if signature:
            body.setdefault("signature", signature)
    return body


# ── Install / uninstall / installed list ────────────────────────────────────

@router.post("/install")
async def install_asset(
    request: InstallRequest,
    username: str = Depends(require_username),
):
    repo = _repo()
    asset = await repo.get_asset(request.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="资产不存在")

    profile = (
        client_profile_mod.parse_client_profile_body(request.client_profile)
        or client_profile_mod.default_web_client_profile()
    )
    payload = asset.get("payload") or asset
    listing = {
        "kind": asset.get("kind"),
        "cloud_only": asset.get("cloud_only"),
        "platform_compat": payload.get("platform_compat"),
        "requires_capabilities": payload.get("requires_capabilities"),
    }
    ok, reason = platform_compat.is_compatible(listing, profile, payload=payload)
    if not ok:
        raise HTTPException(status_code=400, detail=reason or "当前环境不兼容此资产")

    if asset.get("paid"):
        # Paid path is Phase 2 (trading_service). Fail fast so the desktop UI
        # can surface it to the user instead of silently marking installed.
        raise HTTPException(
            status_code=402,
            detail="付费资产暂未开放（Phase 2 交易服务尚未接入）",
        )

    entry = await repo.record_install(username, request.asset_id)
    return {
        "installed": entry,
        "payload": payload,
        "materialized": {"materialized": False, "reason": "materializer deferred to Phase 2"},
        "purchase": {},
        "catalog_hint": None,
    }


@router.post("/uninstall")
async def uninstall_asset(
    request: UninstallRequest,
    username: str = Depends(require_username),
):
    removed = await _repo().uninstall(username, request.asset_id)
    return {"uninstalled": bool(removed), "asset_id": request.asset_id}


@router.get("/installed")
async def list_installed(username: str = Depends(require_username)):
    return {"installed": await _repo().list_installed(username)}


# ── Versioning / upgrade / lineage ──────────────────────────────────────────

@router.get("/versions/{identity:path}")
async def list_versions(identity: str):
    return {"versions": await _repo().list_versions(identity)}


@router.post("/upgrade")
async def upgrade_asset(
    request: UpgradeRequest,
    username: str = Depends(require_username),
):
    repo = _repo()
    latest_id = await repo.get_latest_asset_id(request.identity)
    if not latest_id:
        raise HTTPException(status_code=404, detail="资产不存在或无可用版本")
    asset = await repo.get_asset(latest_id)
    if not asset:
        raise HTTPException(status_code=404, detail="资产不存在")
    if asset.get("paid"):
        raise HTTPException(
            status_code=402,
            detail="付费资产暂未开放（Phase 2 交易服务尚未接入）",
        )
    entry = await repo.record_install(username, latest_id)
    return {
        "upgraded_to": latest_id,
        "installed": entry,
        "materialized": {"materialized": False, "reason": "materializer deferred to Phase 2"},
        "purchase": {},
    }


@router.get("/lineage/{asset_id:path}")
async def get_lineage(asset_id: str):
    try:
        parse_asset_id(asset_id)
    except AssetIdError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await _repo().get_lineage(asset_id)


# ── Publish ─────────────────────────────────────────────────────────────────

@router.post("/publish")
async def publish_asset(
    request: PublishRequest,
    username: str = Depends(require_username),
):
    payload = request.payload or {}
    if not payload.get("id"):
        raise HTTPException(status_code=400, detail="缺少资产 id")
    try:
        parse_asset_id(str(payload.get("id")))
    except AssetIdError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        summary = await _repo().publish(payload, publisher=username)
        return {"published": summary}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:  # noqa: BLE001
        logger.exception("[marketplace] publish failed")
        raise HTTPException(status_code=500, detail=f"发布失败: {e}")


# ── Dev-only auth helper ────────────────────────────────────────────────────

@router.post("/_dev/token")
async def dev_issue_token(request: DevTokenRequest):
    settings = get_settings()
    if not settings.dev_endpoints:
        raise HTTPException(status_code=404, detail="dev endpoints disabled")
    try:
        token = issue_token(request.username, ttl_seconds=request.ttl_seconds)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "token": token,
        "token_type": "Bearer",
        "username": request.username.strip(),
        "expires_in": request.ttl_seconds or settings.jwt_ttl_seconds,
    }


# ── Phase-2 stubs (declared so clients receive 501 instead of 404) ──────────

_PHASE2_ROUTES = [
    ("/purchase", "POST"),
    ("/refund", "POST"),
    ("/my/purchases", "GET"),
    ("/my/billing", "GET"),
    ("/my/analytics", "GET"),
    ("/search", "GET"),
    ("/featured", "GET"),
    ("/recommend", "GET"),
    ("/trending", "GET"),
    ("/categories", "GET"),
]


def _phase2_stub(path: str):
    # No parameters so FastAPI doesn't try to validate a body/query.
    async def _handler():
        raise HTTPException(
            status_code=501,
            detail=f"{path} 属于 Phase 2 交易/搜索能力，MVP 暂未开放",
        )

    _handler.__name__ = f"phase2_{path.strip('/').replace('/', '_')}"
    return _handler


for _p, _m in _PHASE2_ROUTES:
    _handler = _phase2_stub(_p)
    if _m == "GET":
        router.get(_p)(_handler)
    else:
        router.post(_p)(_handler)
