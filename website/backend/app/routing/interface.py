"""Structural contract between the LLM gateway and routing engine.

Task 1.4 can replace the bootstrap selector used by the gateway with a full
``RoutingEngine`` implementation as long as it satisfies this protocol.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True, slots=True)
class UpstreamRoute:
    """Provider details required to proxy and account for one request."""

    provider_id: int
    provider_name: str
    base_url: str
    api_key: str
    cost_input_per_1k: float
    cost_output_per_1k: float


class RoutingEngine(Protocol):
    """Minimal provider-selection interface consumed by the gateway."""

    async def select_provider(
        self,
        model_name: str,
        session: AsyncSession,
    ) -> UpstreamRoute | None:
        """Return an available provider route, or ``None`` when none exists."""
