"""Liveness / readiness endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from ..config import get_settings

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz():
    settings = get_settings()
    return {
        "status": "ok",
        "service": "unified-marketplace-backend",
        "version": "0.1.0",
        "storage_backend": settings.storage_backend,
    }
