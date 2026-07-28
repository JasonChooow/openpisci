"""Health-aware provider selection and fallback routing.

The engine deliberately keeps database access request-scoped: provider/model
metadata is read through the gateway's ``AsyncSession``, while routing rules
are cached for at most 30 seconds.  This makes provider additions/removals and
routing-rule edits visible without restarting the service.
"""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from collections.abc import Awaitable, Callable, Sequence
from enum import Enum
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..db import get_session_factory
from ..models import (
    LlmProvider,
    Model,
    ModelRoutingConfig,
    ProviderModel,
    RoutingStrategy,
)
from .interface import UpstreamRoute

T = TypeVar("T")


class CircuitBreakerState(str, Enum):
    """States used by :class:`CircuitBreaker`."""

    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


# Short alias retained for callers that prefer the conventional name.
CircuitState = CircuitBreakerState


class CircuitBreaker:
    """A provider-local CLOSED/OPEN/HALF_OPEN circuit breaker.

    Three consecutive failures open the circuit.  After the recovery timeout,
    one probe at a time is admitted in HALF_OPEN; two successful probes close
    the circuit, while any failed probe opens it again immediately.
    """

    FAILURE_THRESHOLD = 3
    RECOVERY_TIMEOUT = 60.0
    SUCCESS_THRESHOLD = 2

    def __init__(
        self,
        *,
        failure_threshold: int = FAILURE_THRESHOLD,
        recovery_timeout: float = RECOVERY_TIMEOUT,
        success_threshold: int = SUCCESS_THRESHOLD,
        clock: Callable[[], float] | None = None,
    ) -> None:
        if failure_threshold < 1 or success_threshold < 1:
            raise ValueError("circuit-breaker thresholds must be positive")
        if recovery_timeout < 0:
            raise ValueError("recovery_timeout cannot be negative")

        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.success_threshold = success_threshold
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = 0.0
        self._clock = clock or time.time

    def can_execute(self) -> bool:
        """Return whether a call may run, transitioning OPEN to HALF_OPEN."""
        if self.state == CircuitBreakerState.CLOSED:
            return True

        if self.state == CircuitBreakerState.OPEN:
            if self._clock() - self.last_failure_time < self.recovery_timeout:
                return False
            self.state = CircuitBreakerState.HALF_OPEN
            self.success_count = 0

        return True

    def record_success(self) -> None:
        """Record a successful provider call and close a recovered circuit."""
        self.failure_count = 0
        if self.state == CircuitBreakerState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.success_threshold:
                self.state = CircuitBreakerState.CLOSED
                self.success_count = 0
        elif self.state == CircuitBreakerState.CLOSED:
            self.success_count = 0

    def record_failure(self) -> None:
        """Record a failed provider call and open the circuit when required."""
        self.last_failure_time = self._clock()

        if self.state == CircuitBreakerState.HALF_OPEN:
            self.state = CircuitBreakerState.OPEN
            self.failure_count = self.failure_threshold
            self.success_count = 0
            return

        self.failure_count += 1
        self.success_count = 0
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitBreakerState.OPEN


class RoutingConfigCache:
    """30-second in-memory cache of all per-model routing rules."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        *,
        check_interval: float = 30.0,
        clock: Callable[[], float] | None = None,
    ) -> None:
        if check_interval < 0:
            raise ValueError("check_interval cannot be negative")
        self._session_factory = session_factory
        self._check_interval = check_interval
        self._clock = clock or time.time
        self._cache: dict[int, ModelRoutingConfig] = {}
        self._last_check = float("-inf")
        self._reload_lock = asyncio.Lock()

    async def get_config(
        self,
        model_id: int,
        session: AsyncSession | None = None,
    ) -> ModelRoutingConfig | None:
        """Return a model's rule, reloading all rules when the cache is stale."""
        await self.refresh_if_stale(session)
        return self._cache.get(model_id)

    async def refresh_if_stale(self, session: AsyncSession | None = None) -> None:
        """Reload at most once per interval, even under concurrent requests."""
        if self._clock() - self._last_check < self._check_interval:
            return
        async with self._reload_lock:
            if self._clock() - self._last_check < self._check_interval:
                return
            await self._reload(session)

    async def _reload(self, session: AsyncSession | None = None) -> None:
        """Replace the cache atomically with a complete database snapshot."""
        if session is not None:
            result = await session.scalars(select(ModelRoutingConfig))
            configs = list(result.all())
        else:
            factory = self._session_factory or get_session_factory()
            async with factory() as owned_session:
                result = await owned_session.scalars(select(ModelRoutingConfig))
                configs = list(result.all())

        self._cache = {config.model_id: config for config in configs}
        self._last_check = self._clock()

    def invalidate(self) -> None:
        """Force the next lookup to reload (used after an admin mutation)."""
        self._last_check = float("-inf")


class RoutingEngine:
    """Select healthy upstream providers according to each model's strategy."""

    def __init__(
        self,
        config_cache: RoutingConfigCache | None = None,
        *,
        breaker_factory: Callable[[], CircuitBreaker] = CircuitBreaker,
    ) -> None:
        self.config_cache = config_cache or RoutingConfigCache()
        self._breaker_factory = breaker_factory
        self._breakers: dict[int, CircuitBreaker] = {}
        self._round_robin_positions: dict[int, int] = defaultdict(int)
        self._round_robin_lock = asyncio.Lock()

    def get_circuit_breaker(self, provider_id: int) -> CircuitBreaker:
        """Return the stable circuit breaker associated with a provider."""
        breaker = self._breakers.get(provider_id)
        if breaker is None:
            breaker = self._breaker_factory()
            self._breakers[provider_id] = breaker
        return breaker

    async def select_provider(
        self,
        model_name: str,
        session: AsyncSession,
    ) -> UpstreamRoute | None:
        """Satisfy the gateway contract by returning the first candidate."""
        candidates = await self.select_providers(model_name, session)
        return candidates[0] if candidates else None

    async def select_providers(
        self,
        model_name: str,
        session: AsyncSession,
    ) -> list[UpstreamRoute]:
        """Return the complete healthy fallback order for one request."""
        rows = (
            await session.execute(
                select(Model, ProviderModel, LlmProvider)
                .join(ProviderModel, ProviderModel.model_id == Model.id)
                .join(LlmProvider, ProviderModel.provider_id == LlmProvider.id)
                .where(
                    Model.name == model_name,
                    Model.is_active.is_(True),
                    ProviderModel.is_active.is_(True),
                    LlmProvider.is_active.is_(True),
                    LlmProvider.health_status != "down",
                )
                .order_by(ProviderModel.id.asc())
            )
        ).all()
        if not rows:
            return []

        model_id = rows[0][0].id
        config = await self.config_cache.get_config(model_id, session)
        strategy = self._strategy_from_config(config)

        available = [
            (mapping, provider)
            for _, mapping, provider in rows
            if self.get_circuit_breaker(provider.id).can_execute()
        ]
        if not available:
            return []

        ordered = await self._order_candidates(model_id, available, strategy, config)
        return [self._to_route(mapping, provider) for mapping, provider in ordered]

    async def _order_candidates(
        self,
        model_id: int,
        candidates: list[tuple[ProviderModel, LlmProvider]],
        strategy: RoutingStrategy,
        config: ModelRoutingConfig | None,
    ) -> list[tuple[ProviderModel, LlmProvider]]:
        if strategy == RoutingStrategy.CHEAPEST_FIRST:
            return sorted(
                candidates,
                key=lambda item: (
                    item[0].cost_input_per_1k + item[0].cost_output_per_1k,
                    item[0].id,
                ),
            )
        if strategy == RoutingStrategy.PRIORITY:
            return sorted(candidates, key=lambda item: (-item[0].priority, item[0].id))
        if strategy == RoutingStrategy.LATENCY_BASED:
            return sorted(
                candidates,
                key=lambda item: (item[1].avg_latency_ms, item[0].id),
            )
        if strategy == RoutingStrategy.FALLBACK_CHAIN:
            chain = self._fallback_provider_ids(config)
            if not chain:
                return sorted(
                    candidates, key=lambda item: (-item[0].priority, item[0].id)
                )
            by_provider_id = {
                provider.id: (mapping, provider) for mapping, provider in candidates
            }
            return [
                by_provider_id[provider_id]
                for provider_id in chain
                if provider_id in by_provider_id
            ]

        # ROUND_ROBIN rotates the full ordered list so the remaining entries
        # naturally form this request's fallback chain.
        stable = sorted(candidates, key=lambda item: item[0].id)
        async with self._round_robin_lock:
            start = self._round_robin_positions[model_id] % len(stable)
            self._round_robin_positions[model_id] += 1
        return stable[start:] + stable[:start]

    def record_success(self, provider: int | UpstreamRoute) -> None:
        """Record a successful attempt for circuit-breaker recovery."""
        provider_id = provider if isinstance(provider, int) else provider.provider_id
        self.get_circuit_breaker(provider_id).record_success()

    def record_failure(self, provider: int | UpstreamRoute) -> None:
        """Record a failed attempt for circuit-breaker protection."""
        provider_id = provider if isinstance(provider, int) else provider.provider_id
        self.get_circuit_breaker(provider_id).record_failure()

    async def execute_with_fallback(
        self,
        model_name: str,
        session: AsyncSession,
        operation: Callable[[UpstreamRoute], Awaitable[T]],
    ) -> tuple[UpstreamRoute, T]:
        """Execute an operation against candidates until one succeeds.

        This utility is useful outside HTTP request handlers.  The gateway uses
        the same candidate and outcome APIs directly so it can preserve
        streaming responses while retrying failures that occur before headers.
        """
        candidates = await self.select_providers(model_name, session)
        if not candidates:
            raise AllProvidersUnavailable(model_name)

        last_error: Exception | None = None
        for route in candidates:
            try:
                result = await operation(route)
            except Exception as error:
                self.record_failure(route)
                last_error = error
                continue
            self.record_success(route)
            return route, result
        raise AllProvidersUnavailable(model_name) from last_error

    @staticmethod
    def _strategy_from_config(config: ModelRoutingConfig | None) -> RoutingStrategy:
        if config is None:
            return RoutingStrategy.PRIORITY
        try:
            return RoutingStrategy(config.strategy)
        except ValueError:
            return RoutingStrategy.PRIORITY

    @staticmethod
    def _fallback_provider_ids(config: ModelRoutingConfig | None) -> Sequence[int]:
        if config is None or config.fallback_chain is None:
            return ()
        raw_chain = config.fallback_chain
        if isinstance(raw_chain, dict):
            raw_chain = (
                raw_chain.get("providers")
                or raw_chain.get("provider_ids")
                or raw_chain.get("chain")
                or []
            )
        if not isinstance(raw_chain, list):
            return ()

        provider_ids: list[int] = []
        for value in raw_chain:
            try:
                provider_id = int(value)
            except (TypeError, ValueError):
                continue
            if provider_id not in provider_ids:
                provider_ids.append(provider_id)
        return provider_ids

    @staticmethod
    def _to_route(mapping: ProviderModel, provider: LlmProvider) -> UpstreamRoute:
        return UpstreamRoute(
            provider_id=provider.id,
            provider_name=provider.name,
            base_url=provider.base_url,
            api_key=provider.api_key_encrypted,
            cost_input_per_1k=mapping.cost_input_per_1k,
            cost_output_per_1k=mapping.cost_output_per_1k,
        )


class AllProvidersUnavailable(RuntimeError):
    """Raised when every eligible provider failed or was circuit-broken."""

    def __init__(self, model_name: str) -> None:
        super().__init__(f"all providers unavailable for model {model_name!r}")
        self.model_name = model_name
