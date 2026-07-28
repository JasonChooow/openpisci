"""Focused boundary and concurrency tests for token billing."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import AsyncIterator, Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings, strategies as st
from sqlalchemy import create_engine, func, select, update

from app.billing import (
    AlreadyClaimedError,
    BillingConfigurationError,
    BillingService,
    InsufficientBalanceError,
)
from app.models import Base, BillingConfig, LlmProvider, UsageRecord, User


@pytest.fixture()
async def billing_database(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[tuple[int, int]]:
    import app.config as config
    import app.db as db

    database_path = tmp_path / "billing.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database_path}")
    config._settings = None  # type: ignore[attr-defined]
    await db.dispose_engine()

    async with db.get_engine().begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with db.session_scope() as session:
        user = User(username="billing-user", password_hash="unused", balance=1.0)
        provider = LlmProvider(
            name="billing-provider",
            base_url="https://provider.example/v1",
            api_key_encrypted="secret",
            is_active=True,
            health_status="healthy",
        )
        session.add_all(
            [
                user,
                provider,
                BillingConfig(key="daily_free_credits", value="0.5"),
            ]
        )
        await session.flush()
        ids = (user.id, provider.id)

    yield ids

    await db.dispose_engine()
    config._settings = None  # type: ignore[attr-defined]


def test_cost_calculation_uses_separate_input_and_output_prices() -> None:
    service = BillingService()

    assert service.calculate_cost(
        prompt_tokens=125,
        completion_tokens=75,
        cost_input_per_1k=0.8,
        cost_output_per_1k=2.0,
    ) == pytest.approx(0.25)
    assert service.estimate_cost(
        prompt_tokens=100,
        max_tokens=None,
        cost_input_per_1k=1.0,
        cost_output_per_1k=2.0,
    ) == pytest.approx(2.148)

    with pytest.raises(ValueError, match="cannot be negative"):
        service.calculate_cost(
            prompt_tokens=-1,
            completion_tokens=0,
            cost_input_per_1k=1.0,
            cost_output_per_1k=1.0,
        )


@pytest.mark.asyncio
async def test_estimated_balance_accepts_exact_boundary_and_rejects_below_it(
    billing_database: tuple[int, int],
) -> None:
    import app.db as db

    user_id, _ = billing_database
    service = BillingService()

    async with db.session_scope() as session:
        await session.execute(update(User).where(User.id == user_id).values(balance=0.2))
        estimated = await service.ensure_sufficient_balance(
            session,
            user_id=user_id,
            prompt_tokens=100,
            max_tokens=50,
            cost_input_per_1k=1.0,
            cost_output_per_1k=2.0,
        )
    assert estimated == pytest.approx(0.2)

    async with db.session_scope() as session:
        await session.execute(
            update(User).where(User.id == user_id).values(balance=0.199)
        )
        with pytest.raises(InsufficientBalanceError) as raised:
            await service.ensure_sufficient_balance(
                session,
                user_id=user_id,
                prompt_tokens=100,
                max_tokens=50,
                cost_input_per_1k=1.0,
                cost_output_per_1k=2.0,
            )
    assert raised.value.balance == pytest.approx(0.199)
    assert raised.value.estimated_cost == pytest.approx(0.2)

    async with db.get_session_factory()() as session:
        assert await session.scalar(select(User.balance).where(User.id == user_id)) == pytest.approx(0.199)
        assert await session.scalar(select(func.count()).select_from(UsageRecord)) == 0


@pytest.mark.asyncio
async def test_actual_charge_is_persisted_and_duplicate_request_is_idempotent(
    billing_database: tuple[int, int],
) -> None:
    import app.db as db

    user_id, provider_id = billing_database
    service = BillingService()
    charge = {
        "user_id": user_id,
        "model_name": "qwen-plus",
        "provider_id": provider_id,
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "cost_input_per_1k": 1.0,
        "cost_output_per_1k": 2.0,
        "request_id": "chatcmpl-idempotent",
    }

    async with db.session_scope() as session:
        first = await service.record_usage(session, **charge)
        assert first.cost == pytest.approx(0.2)

    async with db.session_scope() as session:
        second = await service.record_usage(session, **charge)
        assert second.id == first.id

    async with db.get_session_factory()() as session:
        balance = await session.scalar(select(User.balance).where(User.id == user_id))
        records = (await session.scalars(select(UsageRecord))).all()
    assert balance == pytest.approx(0.8)
    assert len(records) == 1
    assert records[0].prompt_tokens == 100
    assert records[0].completion_tokens == 50


@pytest.mark.asyncio
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    prompt_tokens=st.integers(min_value=0, max_value=1_000_000),
    completion_tokens=st.integers(min_value=0, max_value=1_000_000),
    input_price=st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("100"),
        places=6,
        allow_nan=False,
        allow_infinity=False,
    ),
    output_price=st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("100"),
        places=6,
        allow_nan=False,
        allow_infinity=False,
    ),
)
async def test_property_4_billing_deduction_accuracy(
    billing_database: tuple[int, int],
    prompt_tokens: int,
    completion_tokens: int,
    input_price: Decimal,
    output_price: Decimal,
) -> None:
    """Feature: cloud-locked-llm-gateway, Property 4: 计费扣除准确性.

    **Validates: Requirements 5.1, 5.2**
    """
    import app.db as db

    user_id, provider_id = billing_database
    service = BillingService()
    initial_balance = 1_000_000.0
    input_price_float = float(input_price)
    output_price_float = float(output_price)
    expected_cost = float(
        (Decimal(prompt_tokens) / Decimal(1000) * input_price)
        + (Decimal(completion_tokens) / Decimal(1000) * output_price)
    )
    request_id = f"property-4-{uuid4().hex}"

    async with db.session_scope() as session:
        await session.execute(
            update(User)
            .where(User.id == user_id)
            .values(balance=initial_balance)
        )
        calculated_cost = service.calculate_cost(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_input_per_1k=input_price_float,
            cost_output_per_1k=output_price_float,
        )
        record = await service.record_usage(
            session,
            user_id=user_id,
            model_name="property-4-model",
            provider_id=provider_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_input_per_1k=input_price_float,
            cost_output_per_1k=output_price_float,
            request_id=request_id,
        )
        record_id = record.id

    async with db.get_session_factory()() as session:
        persisted_record = await session.get(UsageRecord, record_id)
        ending_balance = await session.scalar(
            select(User.balance).where(User.id == user_id)
        )

    assert persisted_record is not None
    assert ending_balance is not None
    tolerance = {"rel": 1e-12, "abs": 1e-9}
    assert calculated_cost == pytest.approx(expected_cost, **tolerance)
    assert persisted_record.cost == pytest.approx(expected_cost, **tolerance)
    assert initial_balance - ending_balance == pytest.approx(
        expected_cost, **tolerance
    )


@pytest.mark.asyncio
async def test_concurrent_charges_do_not_lose_updates_or_double_charge_request_id(
    billing_database: tuple[int, int],
) -> None:
    import app.db as db

    user_id, provider_id = billing_database
    service = BillingService()

    async def charge(request_id: str) -> None:
        async with db.session_scope() as session:
            await service.record_usage(
                session,
                user_id=user_id,
                model_name="qwen-plus",
                provider_id=provider_id,
                prompt_tokens=10,
                completion_tokens=0,
                cost_input_per_1k=1.0,
                cost_output_per_1k=2.0,
                request_id=request_id,
            )

    # Five distinct requests plus one idempotency key submitted three times
    # must produce exactly six atomic 0.01 deductions.
    await asyncio.gather(
        *(charge(f"chatcmpl-{index}") for index in range(5)),
        *(charge("chatcmpl-shared") for _ in range(3)),
    )

    async with db.get_session_factory()() as session:
        balance = await session.scalar(select(User.balance).where(User.id == user_id))
        count = await session.scalar(select(func.count()).select_from(UsageRecord))
    assert balance == pytest.approx(0.94)
    assert count == 6


@pytest.mark.asyncio
async def test_daily_credits_are_claimed_once_per_utc_calendar_day(
    billing_database: tuple[int, int],
) -> None:
    """Validates: Requirements 5.4, 5.5"""
    import app.db as db

    user_id, _ = billing_database
    service = BillingService()
    now = datetime(2025, 2, 10, 15, 30, tzinfo=timezone.utc)

    async with db.session_scope() as session:
        claim = await service.claim_daily_credits(
            session, user_id=user_id, now=now
        )
    assert claim.credited == pytest.approx(0.5)
    assert claim.new_balance == pytest.approx(1.5)
    assert claim.next_claim_at == datetime(
        2025, 2, 11, tzinfo=timezone.utc
    )

    async with db.session_scope() as session:
        with pytest.raises(AlreadyClaimedError):
            await service.claim_daily_credits(
                session, user_id=user_id, now=now
            )

    async with db.get_session_factory()() as session:
        user = await session.get(User, user_id)
    assert user is not None
    assert user.balance == pytest.approx(1.5)
    assert user.daily_claim_date == now.date()


@pytest.mark.asyncio
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    daily_credits=st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("10000"),
        places=6,
        allow_nan=False,
        allow_infinity=False,
    ),
    initial_balance=st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("1000000"),
        places=6,
        allow_nan=False,
        allow_infinity=False,
    ),
    claim_date=st.dates(
        min_value=date(2000, 1, 1),
        max_value=date(2099, 12, 31),
    ),
    utc_microseconds=st.lists(
        st.integers(min_value=0, max_value=86_399_999_999),
        min_size=2,
        max_size=8,
        unique=True,
    ),
)
async def test_property_6_daily_credit_claim_idempotency(
    billing_database: tuple[int, int],
    daily_credits: Decimal,
    initial_balance: Decimal,
    claim_date: date,
    utc_microseconds: list[int],
) -> None:
    """Feature: cloud-locked-llm-gateway, Property 6: 每日免费额度幂等性.

    **Validates: Requirements 5.5**
    """
    import app.db as db

    service = BillingService()
    initial_balance_float = float(initial_balance)
    daily_credits_float = float(daily_credits)
    username = f"property-6-{uuid4().hex}"
    day_start = datetime.combine(
        claim_date, datetime.min.time(), tzinfo=timezone.utc
    )
    claim_times = [
        day_start + timedelta(microseconds=offset)
        for offset in utc_microseconds
    ]

    # A fresh user isolates each generated example; the shared configuration is
    # overwritten before any claim so no prior example can influence this one.
    async with db.session_scope() as session:
        await session.execute(
            update(BillingConfig)
            .where(BillingConfig.key == "daily_free_credits")
            .values(value=str(daily_credits))
        )
        user = User(
            username=username,
            password_hash="unused",
            balance=initial_balance_float,
        )
        session.add(user)
        await session.flush()
        user_id = user.id

    async with db.session_scope() as session:
        first_claim = await service.claim_daily_credits(
            session,
            user_id=user_id,
            now=claim_times[0],
        )

    expected_balance = initial_balance_float + daily_credits_float
    assert first_claim.credited == pytest.approx(daily_credits_float)
    assert first_claim.new_balance == pytest.approx(expected_balance)

    for repeated_time in claim_times[1:]:
        async with db.session_scope() as session:
            with pytest.raises(AlreadyClaimedError):
                await service.claim_daily_credits(
                    session,
                    user_id=user_id,
                    now=repeated_time,
                )

    async with db.get_session_factory()() as session:
        persisted_user = await session.get(User, user_id)
    assert persisted_user is not None
    assert persisted_user.balance == pytest.approx(expected_balance)
    assert persisted_user.daily_claim_date == claim_date


def test_daily_credit_config_requires_a_safe_json_number() -> None:
    """Validates: Requirements 5.4"""
    assert BillingService._parse_daily_free_credits("1.25") == pytest.approx(1.25)
    for invalid in (None, '"1.25"', "true", "-1", "NaN", "not-json"):
        with pytest.raises(BillingConfigurationError):
            BillingService._parse_daily_free_credits(invalid)


@pytest.mark.asyncio
async def test_concurrent_daily_claims_only_credit_once(
    billing_database: tuple[int, int],
) -> None:
    """Validates: Requirements 5.5"""
    import app.db as db

    user_id, _ = billing_database
    now = datetime(2025, 3, 4, 8, tzinfo=timezone.utc)

    async def claim() -> bool:
        async with db.session_scope() as session:
            try:
                await BillingService().claim_daily_credits(
                    session, user_id=user_id, now=now
                )
            except AlreadyClaimedError:
                return False
            return True

    outcomes = await asyncio.gather(*(claim() for _ in range(4)))
    assert outcomes.count(True) == 1

    async with db.get_session_factory()() as session:
        user = await session.get(User, user_id)
    assert user is not None
    assert user.balance == pytest.approx(1.5)
    assert user.daily_claim_date == now.date()


@pytest.fixture()
def billing_api_client(
    isolated_backend: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[TestClient, Path]]:
    database_path = tmp_path / "billing-api.sqlite3"
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


def test_claim_daily_api_requires_auth_and_preserves_balance_on_conflict(
    billing_api_client: tuple[TestClient, Path],
) -> None:
    """Validates: Requirements 5.4, 5.5"""
    client, database_path = billing_api_client
    registration = client.post(
        "/api/auth/register",
        json={"username": "daily-user", "password": "secure password"},
    )
    assert registration.status_code == 201, registration.text
    token = registration.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    unauthenticated = client.post("/api/billing/claim-daily")
    assert unauthenticated.status_code == 401

    with create_engine(f"sqlite:///{database_path}").begin() as connection:
        connection.execute(
            BillingConfig.__table__.insert().values(
                key="daily_free_credits", value="1.25"
            )
        )

    first = client.post("/api/billing/claim-daily", headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["success"] is True
    assert first.json()["credited"] == pytest.approx(1.25)
    assert first.json()["new_balance"] == pytest.approx(1.25)
    assert first.json()["next_claim_at"].endswith("T00:00:00Z")

    repeated = client.post("/api/billing/claim-daily", headers=headers)
    assert repeated.status_code == 409, repeated.text
    assert repeated.json()["error"]["code"] == "already_claimed"

    balance = client.get("/api/auth/user/balance", headers=headers)
    assert balance.status_code == 200
    assert balance.json()["balance"] == pytest.approx(1.25)


@pytest.mark.asyncio
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    prompt_tokens=st.integers(min_value=0, max_value=1_000_000),
    max_tokens=st.integers(min_value=1, max_value=1_000_000),
    input_price=st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("100"),
        places=6,
        allow_nan=False,
        allow_infinity=False,
    ),
    output_price=st.decimals(
        min_value=Decimal("0.000001"),
        max_value=Decimal("100"),
        places=6,
        allow_nan=False,
        allow_infinity=False,
    ),
    balance_fraction=st.one_of(
        st.none(),
        st.integers(min_value=0, max_value=999_999),
    ),
)
async def test_property_5_insufficient_balance_rejection_invariant(
    billing_database: tuple[int, int],
    prompt_tokens: int,
    max_tokens: int,
    input_price: Decimal,
    output_price: Decimal,
    balance_fraction: int | None,
) -> None:
    """Feature: cloud-locked-llm-gateway, Property 5: 余额不足拒绝不变量.

    **Validates: Requirements 5.3**
    """
    import math

    import app.db as db

    user_id, _ = billing_database
    service = BillingService()
    input_price_float = float(input_price)
    output_price_float = float(output_price)
    estimated_cost = service.estimate_cost(
        prompt_tokens=prompt_tokens,
        max_tokens=max_tokens,
        cost_input_per_1k=input_price_float,
        cost_output_per_1k=output_price_float,
    )
    # ``None`` exercises the closest representable balance below the boundary;
    # integer fractions supply varied balances without filtering invalid cases.
    balance = (
        math.nextafter(estimated_cost, 0.0)
        if balance_fraction is None
        else estimated_cost * balance_fraction / 1_000_000
    )
    assert 0 <= balance < estimated_cost

    async with db.session_scope() as session:
        records_before = await session.scalar(
            select(func.count()).select_from(UsageRecord)
        )
        await session.execute(
            update(User).where(User.id == user_id).values(balance=balance)
        )

        with pytest.raises(InsufficientBalanceError) as raised:
            await service.ensure_sufficient_balance(
                session,
                user_id=user_id,
                prompt_tokens=prompt_tokens,
                max_tokens=max_tokens,
                cost_input_per_1k=input_price_float,
                cost_output_per_1k=output_price_float,
            )

        balance_after_rejection = await session.scalar(
            select(User.balance).where(User.id == user_id)
        )
        records_after_rejection = await session.scalar(
            select(func.count()).select_from(UsageRecord)
        )

    assert raised.value.balance == balance
    assert raised.value.estimated_cost == estimated_cost
    assert balance_after_rejection == balance
    assert records_after_rejection == records_before

    async with db.get_session_factory()() as session:
        persisted_balance = await session.scalar(
            select(User.balance).where(User.id == user_id)
        )
        persisted_record_count = await session.scalar(
            select(func.count()).select_from(UsageRecord)
        )
    assert persisted_balance == balance
    assert persisted_record_count == records_before


@pytest.mark.asyncio
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    username_fragment=st.text(
        alphabet=st.sampled_from("abcdefghijklmnopqrstuvwxyz0123456789-_"),
        min_size=1,
        max_size=20,
    ),
    model_name=st.text(
        alphabet=st.sampled_from(
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
        ),
        min_size=1,
        max_size=128,
    ),
    provider_fragment=st.text(
        alphabet=st.sampled_from("abcdefghijklmnopqrstuvwxyz0123456789-_"),
        min_size=1,
        max_size=20,
    ),
    prompt_tokens=st.integers(min_value=0, max_value=1_000_000),
    completion_tokens=st.integers(min_value=0, max_value=1_000_000),
    input_price=st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("100"),
        places=6,
        allow_nan=False,
        allow_infinity=False,
    ),
    output_price=st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("100"),
        places=6,
        allow_nan=False,
        allow_infinity=False,
    ),
    request_id=st.uuids(version=4).map(lambda value: value.hex),
)
async def test_property_7_usage_record_completeness(
    billing_database: tuple[int, int],
    username_fragment: str,
    model_name: str,
    provider_fragment: str,
    prompt_tokens: int,
    completion_tokens: int,
    input_price: Decimal,
    output_price: Decimal,
    request_id: str,
) -> None:
    """Feature: cloud-locked-llm-gateway, Property 7: 用量记录完整性.

    **Validates: Requirements 5.1, 5.6**
    """
    import app.db as db

    service = BillingService()
    example_nonce = uuid4().hex
    isolated_request_id = f"p7-{request_id}-{example_nonce[:16]}"
    input_price_float = float(input_price)
    output_price_float = float(output_price)
    expected_cost = service.calculate_cost(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cost_input_per_1k=input_price_float,
        cost_output_per_1k=output_price_float,
    )

    # Fresh foreign-key rows and a nonce-extended request ID isolate every
    # generated example from the fixture and from all previous examples.
    async with db.session_scope() as session:
        user = User(
            username=f"p7-user-{username_fragment}-{example_nonce[:16]}",
            password_hash="unused",
            balance=expected_cost + 1.0,
        )
        provider = LlmProvider(
            name=f"p7-provider-{provider_fragment}-{example_nonce[:16]}",
            base_url=f"https://{example_nonce}.provider.example/v1",
            api_key_encrypted="property-7-secret",
            is_active=True,
            health_status="healthy",
        )
        session.add_all([user, provider])
        await session.flush()
        user_id = user.id
        provider_id = provider.id

        created_record = await service.record_usage(
            session,
            user_id=user_id,
            model_name=model_name,
            provider_id=provider_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_input_per_1k=input_price_float,
            cost_output_per_1k=output_price_float,
            request_id=isolated_request_id,
        )
        record_id = created_record.id

    async with db.get_session_factory()() as session:
        persisted_record = await session.get(UsageRecord, record_id)

    assert persisted_record is not None
    assert persisted_record.user_id is not None
    assert persisted_record.user_id == user_id
    assert persisted_record.model_id
    assert persisted_record.model_id == model_name
    assert persisted_record.provider_id is not None
    assert persisted_record.provider_id == provider_id
    assert persisted_record.prompt_tokens is not None
    assert persisted_record.prompt_tokens == prompt_tokens
    assert persisted_record.completion_tokens is not None
    assert persisted_record.completion_tokens == completion_tokens
    assert persisted_record.cost is not None
    assert persisted_record.cost == pytest.approx(expected_cost)
    assert persisted_record.request_id
    assert persisted_record.request_id == isolated_request_id
    assert persisted_record.created_at is not None
