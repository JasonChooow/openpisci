"""FastAPI entrypoint for the unified marketplace backend."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .admin import management_router as admin_mgmt_router
from .admin import router as admin_router
from .api import auth, auth_social, health, marketplace
from .billing.router import router as billing_router
from .config import get_settings
from .core.repository import get_marketplace_repository
from .gateway import router as gateway
from .routing.engine import RoutingEngine
from .usage.router import router as usage_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info(
        "[marketplace] booting backend backend=%s root=%s seed=%s",
        settings.storage_backend,
        settings.market_storage_root,
        settings.seed_dir,
    )
    # Local SQLite: create tables + demo account so desktop can login without
    # a separate migration step. Production should use Alembic + Postgres.
    if settings.database_url.startswith("sqlite"):
        from .db import init_models
        from .dev_seed import seed_local_dev

        await init_models()
        await seed_local_dev()
        logger.info("[gateway] local sqlite schema ready url=%s", settings.database_url)

    # Warm the repo so seed import happens on first startup.
    repo = get_marketplace_repository()
    await repo.list_assets()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Unified Marketplace Backend",
        version="0.1.0",
        description=(
            "Extracted from theAgentOS/core/marketplace. Serves the same "
            "/api/marketplace/{index,assets,asset/{id},install,installed,publish} "
            "contract consumed by 9xBot / DimWork / openpiscis / AgentZ / theAgentOS web."
        ),
        lifespan=lifespan,
    )

    origins = [
        o.strip() for o in (settings.cors_origins or "*").split(",") if o.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.routing_engine = RoutingEngine()

    app.include_router(health.router)
    app.include_router(marketplace.router)
    app.include_router(auth.router)
    app.include_router(auth_social.router)
    app.include_router(billing_router)
    app.include_router(usage_router)
    app.include_router(gateway.router)
    app.include_router(admin_router)
    app.include_router(admin_mgmt_router)
    return app


app = create_app()


def run() -> None:
    """Entrypoint for `python -m app.main`."""
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    run()
