"""Database model and async session tests for the cloud LLM gateway."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select

from app.models import Base, RoutingStrategy, User


EXPECTED_GATEWAY_TABLES = {
    "users",
    "llm_providers",
    "models",
    "provider_models",
    "model_routing_config",
    "usage_records",
    "billing_config",
    "admin_users",
}


def test_gateway_metadata_contains_all_tables_and_usage_audit_fields() -> None:
    """The ORM metadata exposes the complete initial schema and usage audit trail."""
    assert EXPECTED_GATEWAY_TABLES <= set(Base.metadata.tables)

    usage_table = Base.metadata.tables["usage_records"]
    assert set(usage_table.columns.keys()) == {
        "id",
        "user_id",
        "model_id",
        "provider_id",
        "prompt_tokens",
        "completion_tokens",
        "cost",
        "request_id",
        "created_at",
    }
    assert all(
        not usage_table.columns[name].nullable
        for name in (
            "user_id",
            "model_id",
            "provider_id",
            "prompt_tokens",
            "completion_tokens",
            "cost",
            "request_id",
            "created_at",
        )
    )
    assert {foreign_key.target_fullname for foreign_key in usage_table.foreign_keys} == {
        "users.id",
        "llm_providers.id",
    }
    assert usage_table.columns.request_id.unique is True
    assert usage_table.columns.user_id.index is True
    assert usage_table.columns.created_at.index is True


def test_provider_pool_and_routing_metadata_match_supported_strategies() -> None:
    """Provider pool metadata supports health-aware selection and all five strategies."""
    provider_table = Base.metadata.tables["llm_providers"]
    assert {
        "name",
        "base_url",
        "api_key_encrypted",
        "is_active",
        "health_status",
        "avg_latency_ms",
    } <= set(provider_table.columns.keys())

    assert {strategy.value for strategy in RoutingStrategy} == {
        "cheapest_first",
        "round_robin",
        "priority",
        "fallback_chain",
        "latency_based",
    }


@pytest.mark.asyncio
async def test_session_scope_commits_with_isolated_async_database(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The async session context commits successful writes and can read them back."""
    import app.config as config
    import app.db as db

    database_path = tmp_path / "gateway.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database_path}")
    config._settings = None  # type: ignore[attr-defined]
    await db.dispose_engine()

    try:
        async with db.get_engine().begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        async with db.session_scope() as session:
            session.add(User(username="gateway-user", password_hash="hashed"))

        async with db.get_session_factory()() as session:
            stored_user = await session.scalar(
                select(User).where(User.username == "gateway-user")
            )

        assert stored_user is not None
        assert stored_user.balance == 0.0
        assert stored_user.role == "user"
    finally:
        await db.dispose_engine()
        config._settings = None  # type: ignore[attr-defined]
