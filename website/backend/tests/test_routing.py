"""Focused unit tests for provider routing, caching, and circuit breaking."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import (
    Base,
    LlmProvider,
    Model,
    ModelRoutingConfig,
    ProviderModel,
    RoutingStrategy,
)
from app.routing.engine import (
    CircuitBreaker,
    CircuitBreakerState,
    RoutingConfigCache,
    RoutingEngine,
)


@dataclass(frozen=True)
class RoutingFixture:
    factory: async_sessionmaker[AsyncSession]
    model_id: int
    provider_ids: tuple[int, int, int]


@pytest.fixture()
async def routing_fixture(tmp_path: Path) -> AsyncIterator[RoutingFixture]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'routing.sqlite3'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        model = Model(
            name="shared-model",
            display_name="Shared Model",
            category="chat",
            is_active=True,
        )
        providers = [
            LlmProvider(
                name="cheap",
                base_url="https://cheap.example/v1",
                api_key_encrypted="cheap-key",
                is_active=True,
                health_status="healthy",
                avg_latency_ms=300,
            ),
            LlmProvider(
                name="priority",
                base_url="https://priority.example/v1",
                api_key_encrypted="priority-key",
                is_active=True,
                health_status="healthy",
                avg_latency_ms=200,
            ),
            LlmProvider(
                name="fast",
                base_url="https://fast.example/v1",
                api_key_encrypted="fast-key",
                is_active=True,
                health_status="healthy",
                avg_latency_ms=50,
            ),
        ]
        session.add(model)
        session.add_all(providers)
        await session.flush()
        session.add_all(
            [
                ProviderModel(
                    provider_id=providers[0].id,
                    model_id=model.id,
                    cost_input_per_1k=1.0,
                    cost_output_per_1k=1.0,
                    priority=1,
                    is_active=True,
                ),
                ProviderModel(
                    provider_id=providers[1].id,
                    model_id=model.id,
                    cost_input_per_1k=3.0,
                    cost_output_per_1k=3.0,
                    priority=10,
                    is_active=True,
                ),
                ProviderModel(
                    provider_id=providers[2].id,
                    model_id=model.id,
                    cost_input_per_1k=2.0,
                    cost_output_per_1k=2.0,
                    priority=5,
                    is_active=True,
                ),
            ]
        )
        session.add(
            ModelRoutingConfig(
                model_id=model.id,
                strategy=RoutingStrategy.PRIORITY.value,
                fallback_chain=[providers[2].id, providers[0].id, providers[1].id],
                rate_limit_rpm=60,
            )
        )
        await session.commit()
        fixture = RoutingFixture(
            factory=factory,
            model_id=model.id,
            provider_ids=tuple(provider.id for provider in providers),
        )

    yield fixture
    await engine.dispose()


@pytest.mark.parametrize(
    ("strategy", "expected_index"),
    [
        (RoutingStrategy.CHEAPEST_FIRST, 0),
        (RoutingStrategy.ROUND_ROBIN, 0),
        (RoutingStrategy.PRIORITY, 1),
        (RoutingStrategy.FALLBACK_CHAIN, 2),
        (RoutingStrategy.LATENCY_BASED, 2),
    ],
)
async def test_all_strategies_select_the_expected_first_provider(
    routing_fixture: RoutingFixture,
    strategy: RoutingStrategy,
    expected_index: int,
) -> None:
    async with routing_fixture.factory() as session:
        config = await session.get(ModelRoutingConfig, 1)
        assert config is not None
        config.strategy = strategy.value
        await session.commit()

    routing_engine = RoutingEngine(
        RoutingConfigCache(routing_fixture.factory, check_interval=30)
    )
    async with routing_fixture.factory() as session:
        route = await routing_engine.select_provider("shared-model", session)

    assert route is not None
    assert route.provider_id == routing_fixture.provider_ids[expected_index]


async def test_round_robin_rotates_and_retains_fallback_order(
    routing_fixture: RoutingFixture,
) -> None:
    async with routing_fixture.factory() as session:
        config = await session.get(ModelRoutingConfig, 1)
        assert config is not None
        config.strategy = RoutingStrategy.ROUND_ROBIN.value
        await session.commit()

    routing_engine = RoutingEngine(RoutingConfigCache(routing_fixture.factory))
    selected: list[int] = []
    async with routing_fixture.factory() as session:
        for _ in range(4):
            routes = await routing_engine.select_providers("shared-model", session)
            selected.append(routes[0].provider_id)
            assert set(route.provider_id for route in routes) == set(
                routing_fixture.provider_ids
            )

    assert selected == [
        routing_fixture.provider_ids[0],
        routing_fixture.provider_ids[1],
        routing_fixture.provider_ids[2],
        routing_fixture.provider_ids[0],
    ]


def test_circuit_breaker_transitions_closed_open_half_open_closed() -> None:
    now = [100.0]
    breaker = CircuitBreaker(clock=lambda: now[0])

    for _ in range(3):
        assert breaker.can_execute() is True
        breaker.record_failure()

    assert breaker.state == CircuitBreakerState.OPEN
    assert breaker.can_execute() is False

    now[0] += 60
    assert breaker.can_execute() is True
    assert breaker.state == CircuitBreakerState.HALF_OPEN
    assert breaker.can_execute() is True

    breaker.record_success()
    assert breaker.can_execute() is True
    breaker.record_success()
    assert breaker.state == CircuitBreakerState.CLOSED
    assert breaker.can_execute() is True


def test_half_open_failure_reopens_immediately() -> None:
    now = [10.0]
    breaker = CircuitBreaker(clock=lambda: now[0])
    for _ in range(3):
        breaker.record_failure()
    now[0] += 60

    assert breaker.can_execute() is True
    breaker.record_failure()

    assert breaker.state == CircuitBreakerState.OPEN
    assert breaker.can_execute() is False


async def test_config_cache_reloads_only_after_thirty_seconds(
    routing_fixture: RoutingFixture,
) -> None:
    now = [0.0]
    cache = RoutingConfigCache(
        routing_fixture.factory,
        check_interval=30,
        clock=lambda: now[0],
    )
    routing_engine = RoutingEngine(cache)

    async with routing_fixture.factory() as session:
        initial = await routing_engine.select_provider("shared-model", session)
    assert initial is not None
    assert initial.provider_id == routing_fixture.provider_ids[1]

    async with routing_fixture.factory() as session:
        config = await session.get(ModelRoutingConfig, 1)
        assert config is not None
        config.strategy = RoutingStrategy.CHEAPEST_FIRST.value
        await session.commit()

    now[0] = 29.9
    async with routing_fixture.factory() as session:
        cached = await routing_engine.select_provider("shared-model", session)
    assert cached is not None
    assert cached.provider_id == routing_fixture.provider_ids[1]

    now[0] = 30.0
    async with routing_fixture.factory() as session:
        reloaded = await routing_engine.select_provider("shared-model", session)
    assert reloaded is not None
    assert reloaded.provider_id == routing_fixture.provider_ids[0]


async def test_execute_with_fallback_tries_next_provider(
    routing_fixture: RoutingFixture,
) -> None:
    routing_engine = RoutingEngine(RoutingConfigCache(routing_fixture.factory))
    attempted: list[int] = []

    async def operation(route):
        attempted.append(route.provider_id)
        if len(attempted) == 1:
            raise RuntimeError("first provider failed")
        return "ok"

    async with routing_fixture.factory() as session:
        route, result = await routing_engine.execute_with_fallback(
            "shared-model", session, operation
        )

    assert result == "ok"
    assert attempted == [
        routing_fixture.provider_ids[1],
        routing_fixture.provider_ids[2],
    ]
    assert route.provider_id == routing_fixture.provider_ids[2]
