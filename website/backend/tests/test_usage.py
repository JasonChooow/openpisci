"""Focused service and API tests for authenticated usage reporting."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.models import Base, LlmProvider, UsageRecord, User
from app.usage import UsagePeriod, UsageService


@pytest.fixture()
async def usage_database(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[tuple[int, int, int]]:
    import app.config as config
    import app.db as db

    database_path = tmp_path / "usage-service.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database_path}")
    config._settings = None  # type: ignore[attr-defined]
    await db.dispose_engine()

    async with db.get_engine().begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with db.session_scope() as session:
        alice = User(username="usage-alice", password_hash="unused", balance=8.5)
        bob = User(username="usage-bob", password_hash="unused", balance=3.0)
        provider = LlmProvider(
            name="usage-provider",
            base_url="https://provider.example/v1",
            api_key_encrypted="secret",
        )
        session.add_all([alice, bob, provider])
        await session.flush()
        session.add_all(
            [
                UsageRecord(
                    user_id=alice.id,
                    model_id="qwen-plus",
                    provider_id=provider.id,
                    prompt_tokens=1,
                    completion_tokens=2,
                    cost=0.01,
                    request_id="before-month",
                    created_at=datetime(2025, 1, 31, 23, 59, 59, 999999),
                ),
                UsageRecord(
                    user_id=alice.id,
                    model_id="gpt-4o",
                    provider_id=provider.id,
                    prompt_tokens=10,
                    completion_tokens=20,
                    cost=0.1,
                    request_id="month-start",
                    created_at=datetime(2025, 2, 1),
                ),
                UsageRecord(
                    user_id=alice.id,
                    model_id="qwen-plus",
                    provider_id=provider.id,
                    prompt_tokens=30,
                    completion_tokens=40,
                    cost=0.2,
                    request_id="day-start",
                    created_at=datetime(2025, 2, 10),
                ),
                UsageRecord(
                    user_id=bob.id,
                    model_id="private-model",
                    provider_id=provider.id,
                    prompt_tokens=999,
                    completion_tokens=999,
                    cost=99.0,
                    request_id="other-user",
                    created_at=datetime(2025, 2, 10, 12),
                ),
            ]
        )
        ids = (alice.id, bob.id, provider.id)

    yield ids

    await db.dispose_engine()
    config._settings = None  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_usage_service_applies_utc_day_month_boundaries_and_model_groups(
    usage_database: tuple[int, int, int],
) -> None:
    """Validates: Requirements 6.2, 6.3"""
    import app.db as db

    alice_id, _, _ = usage_database
    now = datetime(2025, 2, 10, 18, tzinfo=timezone.utc)
    async with db.get_session_factory()() as session:
        daily = await UsageService().get_summary(
            session, user_id=alice_id, period=UsagePeriod.DAILY, now=now
        )
        monthly = await UsageService().get_summary(
            session, user_id=alice_id, period=UsagePeriod.MONTHLY, now=now
        )
        models = await UsageService().get_by_model(
            session, user_id=alice_id, period=UsagePeriod.MONTHLY, now=now
        )

    assert (daily.prompt_tokens, daily.completion_tokens, daily.total_tokens) == (
        30,
        40,
        70,
    )
    assert daily.total_cost == pytest.approx(0.2)
    assert daily.request_count == 1
    assert (monthly.prompt_tokens, monthly.completion_tokens) == (40, 60)
    assert monthly.total_cost == pytest.approx(0.3)
    assert monthly.request_count == 2
    assert [item.model for item in models] == ["gpt-4o", "qwen-plus"]
    assert [item.request_count for item in models] == [1, 1]
    assert all(item.model != "private-model" for item in models)


@pytest.mark.asyncio
async def test_usage_service_transactions_use_inclusive_dates_and_stable_pagination(
    usage_database: tuple[int, int, int],
) -> None:
    """Validates: Requirements 6.4"""
    import app.db as db

    alice_id, _, _ = usage_database
    service = UsageService()
    async with db.get_session_factory()() as session:
        first = await service.get_transactions(
            session,
            user_id=alice_id,
            page=1,
            page_size=1,
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 10),
        )
        second = await service.get_transactions(
            session,
            user_id=alice_id,
            page=2,
            page_size=1,
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 10),
        )

    assert first.total == second.total == 2
    assert [record.request_id for record in first.items] == ["day-start"]
    assert [record.request_id for record in second.items] == ["month-start"]


@pytest.fixture()
def usage_api_client(
    isolated_backend: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[TestClient, Path]]:
    database_path = tmp_path / "usage-api.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database_path}")

    import app.config as config
    import app.db as db
    from app.auth.jwt import reset_revocations

    config._settings = None  # type: ignore[attr-defined]
    db.reset_db_cache()
    reset_revocations()

    schema_engine = create_engine(f"sqlite:///{database_path}")
    Base.metadata.create_all(schema_engine)
    schema_engine.dispose()

    from app.main import create_app

    with TestClient(create_app()) as client:
        yield client, database_path

    asyncio.run(db.dispose_engine())
    config._settings = None  # type: ignore[attr-defined]
    reset_revocations()


def _register(client: TestClient, username: str) -> dict[str, object]:
    response = client.post(
        "/api/auth/register",
        json={"username": username, "password": "secure password"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _seed_api_usage(database_path: Path, alice_id: int, bob_id: int) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    month_start = datetime(now.year, now.month, 1)
    month_only = month_start + timedelta(days=1) if now.day == 1 else month_start
    with create_engine(f"sqlite:///{database_path}").begin() as connection:
        provider_id = connection.execute(
            LlmProvider.__table__.insert().values(
                name="api-usage-provider",
                base_url="https://provider.example/v1",
                api_key_encrypted="secret",
                is_active=True,
                health_status="healthy",
                avg_latency_ms=0,
            )
        ).inserted_primary_key[0]
        connection.execute(
            UsageRecord.__table__.insert(),
            [
                {
                    "user_id": alice_id,
                    "model_id": "qwen-plus",
                    "provider_id": provider_id,
                    "prompt_tokens": 100,
                    "completion_tokens": 50,
                    "cost": 0.25,
                    "request_id": "api-alice-now",
                    "created_at": now,
                },
                {
                    "user_id": alice_id,
                    "model_id": "gpt-4o",
                    "provider_id": provider_id,
                    "prompt_tokens": 20,
                    "completion_tokens": 10,
                    "cost": 0.5,
                    "request_id": "api-alice-month-start",
                    "created_at": month_only,
                },
                {
                    "user_id": bob_id,
                    "model_id": "private-model",
                    "provider_id": provider_id,
                    "prompt_tokens": 900,
                    "completion_tokens": 900,
                    "cost": 90.0,
                    "request_id": "api-bob-private",
                    "created_at": now,
                },
            ],
        )


def test_usage_apis_require_bearer_auth_and_isolate_current_user(
    usage_api_client: tuple[TestClient, Path],
) -> None:
    """Validates: Requirements 6.1, 6.2, 6.3, 6.4"""
    client, database_path = usage_api_client
    alice = _register(client, "api-alice")
    bob = _register(client, "api-bob")
    _seed_api_usage(
        database_path,
        int(alice["user"]["id"]),  # type: ignore[index]
        int(bob["user"]["id"]),  # type: ignore[index]
    )

    for path in (
        "/api/usage/summary",
        "/api/usage/by-model",
        "/api/usage/transactions",
    ):
        assert client.get(path).status_code == 401
        assert (
            client.get(path, headers={"Authorization": "Bearer invalid"}).status_code
            == 401
        )

    headers = {"Authorization": f"Bearer {alice['access_token']}"}
    balance = client.get("/api/auth/user/balance", headers=headers)
    assert balance.status_code == 200
    assert balance.json() == {"balance": 0.0, "currency": "CNY"}

    summary = client.get(
        "/api/usage/summary?period=daily", headers=headers
    )
    assert summary.status_code == 200, summary.text
    assert summary.json() == {
        "period": "daily",
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "total_tokens": 150,
        "total_cost": 0.25,
        "request_count": 1,
    }

    by_model = client.get(
        "/api/usage/by-model?period=monthly", headers=headers
    )
    assert by_model.status_code == 200, by_model.text
    assert [item["model"] for item in by_model.json()["models"]] == [
        "gpt-4o",
        "qwen-plus",
    ]
    assert sum(item["request_count"] for item in by_model.json()["models"]) == 2

    transactions = client.get("/api/usage/transactions", headers=headers)
    assert transactions.status_code == 200, transactions.text
    assert transactions.json()["total"] == 2
    assert all(
        item["model"] != "private-model" for item in transactions.json()["items"]
    )
    assert all(item["created_at"].endswith("Z") for item in transactions.json()["items"])


def test_transactions_api_validates_inclusive_date_range_and_pagination(
    usage_api_client: tuple[TestClient, Path],
) -> None:
    """Validates: Requirements 6.4"""
    client, database_path = usage_api_client
    alice = _register(client, "range-alice")
    bob = _register(client, "range-bob")
    _seed_api_usage(
        database_path,
        int(alice["user"]["id"]),  # type: ignore[index]
        int(bob["user"]["id"]),  # type: ignore[index]
    )
    headers = {"Authorization": f"Bearer {alice['access_token']}"}
    today = datetime.now(timezone.utc).date().isoformat()

    response = client.get(
        "/api/usage/transactions",
        params={
            "page": 1,
            "page_size": 1,
            "start_date": today,
            "end_date": today,
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert response.json()["page"] == 1
    assert response.json()["page_size"] == 1
    assert len(response.json()["items"]) == 1

    reversed_range = client.get(
        "/api/usage/transactions",
        params={
            "start_date": today,
            "end_date": (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat(),
        },
        headers=headers,
    )
    assert reversed_range.status_code == 422
    assert client.get(
        "/api/usage/transactions?page=0", headers=headers
    ).status_code == 422
    assert client.get(
        "/api/usage/transactions?page_size=101", headers=headers
    ).status_code == 422
    assert client.get(
        "/api/usage/summary?period=weekly", headers=headers
    ).status_code == 422
