"""Property tests for routing-strategy selection invariants."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import pytest
from hypothesis import given, settings, strategies as st
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LlmProvider, ModelRoutingConfig, ProviderModel, RoutingStrategy
from app.routing.engine import AllProvidersUnavailable, RoutingEngine
from app.routing.interface import UpstreamRoute


@dataclass(frozen=True, slots=True)
class ProviderConfiguration:
    """Generated metadata for one provider-model mapping."""

    provider_id: int
    input_cost_milliunits: int
    output_cost_milliunits: int
    priority: int
    latency_ms: int
    healthy: bool


@dataclass(frozen=True, slots=True)
class RoutingConfiguration:
    """Generated provider pool and routing inputs for one property example."""

    providers: tuple[ProviderConfiguration, ...]
    fallback_chain: tuple[int, ...]
    round_robin_calls: int


@st.composite
def routing_configurations(draw: st.DrawFn) -> RoutingConfiguration:
    """Generate bounded provider pools with at least one healthy provider."""
    provider_count = draw(st.integers(min_value=1, max_value=8))
    costs = st.integers(min_value=0, max_value=1_000_000)
    priorities = st.integers(min_value=-100, max_value=100)
    latencies = st.integers(min_value=0, max_value=60_000)

    input_costs = draw(st.lists(costs, min_size=provider_count, max_size=provider_count))
    output_costs = draw(st.lists(costs, min_size=provider_count, max_size=provider_count))
    provider_priorities = draw(
        st.lists(priorities, min_size=provider_count, max_size=provider_count)
    )
    provider_latencies = draw(
        st.lists(latencies, min_size=provider_count, max_size=provider_count)
    )
    healthy_indexes = draw(
        st.sets(
            st.integers(min_value=0, max_value=provider_count - 1),
            min_size=1,
            max_size=provider_count,
        )
    )
    provider_ids = tuple(range(1, provider_count + 1))
    fallback_chain = draw(st.permutations(provider_ids))

    providers = tuple(
        ProviderConfiguration(
            provider_id=index + 1,
            input_cost_milliunits=input_costs[index],
            output_cost_milliunits=output_costs[index],
            priority=provider_priorities[index],
            latency_ms=provider_latencies[index],
            healthy=index in healthy_indexes,
        )
        for index in range(provider_count)
    )
    return RoutingConfiguration(
        providers=providers,
        fallback_chain=fallback_chain,
        round_robin_calls=draw(st.integers(min_value=1, max_value=64)),
    )


def _healthy_candidates(
    configuration: RoutingConfiguration,
) -> list[tuple[ProviderModel, LlmProvider]]:
    candidates: list[tuple[ProviderModel, LlmProvider]] = []
    for item in configuration.providers:
        provider = LlmProvider(
            id=item.provider_id,
            name=f"provider-{item.provider_id}",
            base_url=f"https://provider-{item.provider_id}.example/v1",
            api_key_encrypted=f"key-{item.provider_id}",
            is_active=True,
            health_status="healthy" if item.healthy else "down",
            avg_latency_ms=item.latency_ms,
        )
        mapping = ProviderModel(
            id=item.provider_id,
            provider_id=item.provider_id,
            model_id=1,
            cost_input_per_1k=item.input_cost_milliunits / 1_000,
            cost_output_per_1k=item.output_cost_milliunits / 1_000,
            priority=item.priority,
            is_active=True,
        )
        if item.healthy:
            candidates.append((mapping, provider))
    return candidates


@settings(max_examples=100, deadline=None)
@given(configuration=routing_configurations())
async def test_routing_engine_strategy_invariants(
    configuration: RoutingConfiguration,
) -> None:
    """Feature: cloud-locked-llm-gateway, Property 2: 路由引擎策略一致性.

    **Validates: Requirements 4.2, 4.3, 4.4**
    """
    model_id = 1
    candidates = _healthy_candidates(configuration)
    engine = RoutingEngine()

    cheapest = await engine._order_candidates(  # noqa: SLF001
        model_id, candidates, RoutingStrategy.CHEAPEST_FIRST, None
    )
    selected_cost = (
        cheapest[0][0].cost_input_per_1k + cheapest[0][0].cost_output_per_1k
    )
    assert all(
        selected_cost <= mapping.cost_input_per_1k + mapping.cost_output_per_1k
        for mapping, _ in candidates
    )

    priority = await engine._order_candidates(  # noqa: SLF001
        model_id, candidates, RoutingStrategy.PRIORITY, None
    )
    assert all(priority[0][0].priority >= mapping.priority for mapping, _ in candidates)

    latency = await engine._order_candidates(  # noqa: SLF001
        model_id, candidates, RoutingStrategy.LATENCY_BASED, None
    )
    assert all(
        latency[0][1].avg_latency_ms <= provider.avg_latency_ms
        for _, provider in candidates
    )

    selections: Counter[int] = Counter()
    for _ in range(configuration.round_robin_calls):
        round_robin = await engine._order_candidates(  # noqa: SLF001
            model_id, candidates, RoutingStrategy.ROUND_ROBIN, None
        )
        selections[round_robin[0][1].id] += 1
    selection_counts = [selections[provider.id] for _, provider in candidates]
    assert max(selection_counts) - min(selection_counts) <= 1

    fallback_config = ModelRoutingConfig(
        model_id=model_id,
        strategy=RoutingStrategy.FALLBACK_CHAIN.value,
        fallback_chain=list(configuration.fallback_chain),
        rate_limit_rpm=60,
    )
    fallback = await engine._order_candidates(  # noqa: SLF001
        model_id, candidates, RoutingStrategy.FALLBACK_CHAIN, fallback_config
    )
    healthy_ids = {provider.id for _, provider in candidates}
    expected_provider_id = next(
        provider_id
        for provider_id in configuration.fallback_chain
        if provider_id in healthy_ids
    )
    assert fallback[0][1].id == expected_provider_id


class OrderedProviderRoutingEngine(RoutingEngine):
    """Routing engine whose available routes are already in fallback order."""

    def __init__(self, routes: tuple[UpstreamRoute, ...]) -> None:
        super().__init__()
        self._routes = routes

    async def select_providers(
        self,
        model_name: str,
        session: AsyncSession,
    ) -> list[UpstreamRoute]:
        assert model_name == "property-test-model"
        return list(self._routes)


class GeneratedProviderFailure(RuntimeError):
    """Failure raised by a generated unavailable provider."""


@settings(max_examples=100, deadline=None)
@given(
    failure_sequence=st.lists(
        st.booleans(),
        min_size=1,
        max_size=8,
    )
)
async def test_routing_engine_falls_back_in_order(
    failure_sequence: list[bool],
) -> None:
    """Feature: cloud-locked-llm-gateway, Property 3: 路由引擎故障回退.

    **Validates: Requirements 4.5**
    """
    routes = tuple(
        UpstreamRoute(
            provider_id=index,
            provider_name=f"provider-{index}",
            base_url=f"https://provider-{index}.example/v1",
            api_key=f"key-{index}",
            cost_input_per_1k=1.0,
            cost_output_per_1k=1.0,
        )
        for index in range(1, len(failure_sequence) + 1)
    )
    engine = OrderedProviderRoutingEngine(routes)
    attempted_provider_ids: list[int] = []

    async def operation(route: UpstreamRoute) -> str:
        attempted_provider_ids.append(route.provider_id)
        if failure_sequence[route.provider_id - 1]:
            raise GeneratedProviderFailure(f"provider {route.provider_id} failed")
        return f"response-from-{route.provider_id}"

    if all(failure_sequence):
        with pytest.raises(AllProvidersUnavailable) as error:
            await engine.execute_with_fallback(
                "property-test-model",
                None,  # type: ignore[arg-type]
                operation,
            )

        assert attempted_provider_ids == [route.provider_id for route in routes]
        assert isinstance(error.value.__cause__, GeneratedProviderFailure)
        return

    first_success_index = failure_sequence.index(False)
    selected_route, result = await engine.execute_with_fallback(
        "property-test-model",
        None,  # type: ignore[arg-type]
        operation,
    )

    assert attempted_provider_ids == [
        route.provider_id for route in routes[: first_success_index + 1]
    ]
    assert selected_route == routes[first_success_index]
    assert result == f"response-from-{selected_route.provider_id}"
