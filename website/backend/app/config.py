"""Runtime configuration resolved from environment variables.

Precedence: explicit env var > defaults suitable for local development.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]  # 9xBot/website
BACKEND_ROOT = REPO_ROOT / "backend"


@dataclass(frozen=True)
class Settings:
    """Immutable snapshot of runtime settings."""

    # Storage backend. Only "json" (file-JSON) is implemented in MVP.
    storage_backend: str = "json"

    # File-JSON storage root for assets + installs.
    market_storage_root: Path = BACKEND_ROOT / "var" / "marketplace"

    # Official-catalog seed dir (mirrors theAgentOS/marketplace/seed/official-catalog).
    seed_dir: Path = BACKEND_ROOT / "seed" / "official-catalog"

    # JSON Schema files for publish validation.
    schema_dir: Path = BACKEND_ROOT / "schema"

    # HMAC signing key for /api/marketplace/index summaries. Empty = signatures disabled.
    signing_secret: str = ""

    # HS256 JWT secret for /install /publish auth. Empty = dev tokens only.
    jwt_secret: str = "dev-marketplace-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_ttl_seconds: int = 60 * 60 * 24 * 7  # 7 days

    # CORS whitelist (comma-separated); "*" allows any origin.
    cors_origins: str = "*"

    # Host + port for uvicorn (used by module runner).
    host: str = "0.0.0.0"
    port: int = 8137

    # Enable dev-only endpoints (/api/marketplace/_dev/token).
    dev_endpoints: bool = True

    # Async SQLAlchemy database URL (asyncpg driver in production, e.g.
    # "postgresql+asyncpg://user:pass@host/dbname"). Defaults to a local
    # SQLite file (aiosqlite driver) so the gateway modules import and run
    # without a Postgres instance during local development/tests.
    database_url: str = f"sqlite+aiosqlite:///{BACKEND_ROOT / 'var' / 'gateway.db'}"

    # Echo SQL statements to logs (debug only).
    db_echo: bool = False


def _resolve_path(env_key: str, default: Path) -> Path:
    val = os.environ.get(env_key, "").strip()
    if val:
        return Path(val).expanduser().resolve()
    return default


def load_settings() -> Settings:
    """Build the settings object from environment variables."""

    return Settings(
        storage_backend=os.environ.get("MARKET_STORAGE_BACKEND", "json").lower(),
        market_storage_root=_resolve_path(
            "MARKET_STORAGE_ROOT", BACKEND_ROOT / "var" / "marketplace"
        ),
        seed_dir=_resolve_path("MARKET_SEED_DIR", BACKEND_ROOT / "seed" / "official-catalog"),
        schema_dir=_resolve_path("MARKET_SCHEMA_DIR", BACKEND_ROOT / "schema"),
        signing_secret=os.environ.get("MARKET_SIGNING_SECRET", "").strip(),
        jwt_secret=os.environ.get("MARKET_JWT_SECRET", "dev-marketplace-secret-change-me"),
        jwt_algorithm=os.environ.get("MARKET_JWT_ALG", "HS256"),
        jwt_ttl_seconds=int(os.environ.get("MARKET_JWT_TTL", str(60 * 60 * 24 * 7))),
        cors_origins=os.environ.get("MARKET_CORS_ORIGINS", "*"),
        host=os.environ.get("MARKET_HOST", "0.0.0.0"),
        port=int(os.environ.get("MARKET_PORT", "8137")),
        dev_endpoints=os.environ.get("MARKET_DEV_ENDPOINTS", "1").lower()
        not in ("0", "false", "no", ""),
        database_url=os.environ.get(
            "DATABASE_URL",
            f"sqlite+aiosqlite:///{BACKEND_ROOT / 'var' / 'gateway.db'}",
        ),
        db_echo=os.environ.get("MARKET_DB_ECHO", "0").lower() in ("1", "true", "yes"),
    )


_settings: Settings | None = None


def get_settings() -> Settings:
    """Cached settings accessor."""
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings
