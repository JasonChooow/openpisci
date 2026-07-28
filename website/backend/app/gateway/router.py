"""Authenticated, OpenAI-compatible LLM gateway endpoints."""

from __future__ import annotations

import codecs
import json
import math
from typing import Annotated, Any
from uuid import uuid4

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_username
from ..billing import BillingService, InsufficientBalanceError
from ..db import get_session, session_scope
from ..models import LlmProvider, Model, ProviderModel, User
from ..routing.interface import RoutingEngine, UpstreamRoute

router = APIRouter(prefix="/api/llm/v1", tags=["llm-gateway"])

_UPSTREAM_TIMEOUT = httpx.Timeout(120.0, connect=15.0)
_billing_service = BillingService()


class ChatCompletionRequest(BaseModel):
    """OpenAI chat request fields used by the gateway; extras pass through."""

    model_config = ConfigDict(extra="allow")

    model: str = Field(min_length=1, max_length=128)
    messages: list[dict[str, Any]] = Field(min_length=1)
    stream: bool = False
    max_tokens: int | None = Field(default=None, ge=1)


class _PriorityBootstrapRoutingEngine:
    """Small operational selector until task 1.4 supplies the full engine.

    It intentionally implements only the existing default priority behavior;
    strategies, fallback, circuit breaking, and configuration caching remain
    the responsibility of task 1.4.
    """

    async def select_provider(
        self,
        model_name: str,
        session: AsyncSession,
    ) -> UpstreamRoute | None:
        row = (
            await session.execute(
                select(ProviderModel, LlmProvider)
                .join(Model, ProviderModel.model_id == Model.id)
                .join(LlmProvider, ProviderModel.provider_id == LlmProvider.id)
                .where(
                    Model.name == model_name,
                    Model.is_active.is_(True),
                    ProviderModel.is_active.is_(True),
                    LlmProvider.is_active.is_(True),
                    LlmProvider.health_status != "down",
                )
                .order_by(ProviderModel.priority.desc(), ProviderModel.id.asc())
                .limit(1)
            )
        ).first()
        if row is None:
            return None
        mapping, provider = row
        return UpstreamRoute(
            provider_id=provider.id,
            provider_name=provider.name,
            base_url=provider.base_url,
            # Provider key decryption belongs at the routing/configuration boundary.
            # Existing task-1.1 data stores the configured value in this column.
            api_key=provider.api_key_encrypted,
            cost_input_per_1k=mapping.cost_input_per_1k,
            cost_output_per_1k=mapping.cost_output_per_1k,
        )


_bootstrap_routing_engine = _PriorityBootstrapRoutingEngine()


def get_routing_engine(request: Request) -> RoutingEngine:
    """Resolve an application-supplied engine, falling back to DB priority."""
    return getattr(request.app.state, "routing_engine", _bootstrap_routing_engine)


async def _select_routes(
    routing_engine: RoutingEngine,
    model_name: str,
    session: AsyncSession,
) -> tuple[list[UpstreamRoute], bool]:
    """Resolve an ordered fallback chain while supporting legacy selectors."""
    select_many = getattr(routing_engine, "select_providers", None)
    if callable(select_many):
        routes = await select_many(model_name, session)
        return list(routes), True
    route = await routing_engine.select_provider(model_name, session)
    return ([route] if route is not None else []), False


def _record_route_outcome(
    routing_engine: RoutingEngine,
    method_name: str,
    route: UpstreamRoute,
) -> None:
    recorder = getattr(routing_engine, method_name, None)
    if callable(recorder):
        recorder(route)


def _upstream_headers(route: UpstreamRoute, *, stream: bool) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {route.api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream" if stream else "application/json",
    }


async def _require_database_user(
    username: Annotated[str, Depends(require_username)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    user = await session.scalar(select(User).where(User.username == username))
    if user is None:
        # A valid JWT is not sufficient if its subject no longer maps to an account.
        from fastapi import HTTPException

        raise HTTPException(
            status_code=401, detail="authenticated user no longer exists"
        )
    return user


def _error(status_code: int, code: str, message: str, **details: Any) -> JSONResponse:
    payload: dict[str, Any] = {"code": code, "message": message}
    payload.update(details)
    return JSONResponse(status_code=status_code, content={"error": payload})


def _estimate_prompt_tokens(messages: list[dict[str, Any]]) -> int:
    """Conservatively estimate prompt tokens from serialized message content."""
    serialized = json.dumps(messages, ensure_ascii=False, separators=(",", ":"))
    return max(1, math.ceil(len(serialized) / 4))


def _estimate_cost(payload: ChatCompletionRequest, route: UpstreamRoute) -> float:
    return _billing_service.estimate_cost(
        prompt_tokens=_estimate_prompt_tokens(payload.messages),
        max_tokens=payload.max_tokens,
        cost_input_per_1k=route.cost_input_per_1k,
        cost_output_per_1k=route.cost_output_per_1k,
    )


def _chat_completions_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _new_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=_UPSTREAM_TIMEOUT)


def _usage_from_payload(payload: Any) -> tuple[int, int] | None:
    if not isinstance(payload, dict) or not isinstance(payload.get("usage"), dict):
        return None
    usage = payload["usage"]
    try:
        return max(0, int(usage.get("prompt_tokens", 0))), max(
            0, int(usage.get("completion_tokens", 0))
        )
    except (TypeError, ValueError):
        return None


async def _persist_usage(
    *,
    state: dict[str, Any],
    user_id: int,
    model_name: str,
    route: UpstreamRoute,
) -> None:
    """Charge and persist usage in a fresh session after the response completes."""
    if not state.get("completed"):
        return
    async with session_scope() as session:
        await _billing_service.record_usage(
            session,
            user_id=user_id,
            model_name=model_name,
            provider_id=route.provider_id,
            prompt_tokens=int(state.get("prompt_tokens", 0)),
            completion_tokens=int(state.get("completion_tokens", 0)),
            cost_input_per_1k=route.cost_input_per_1k,
            cost_output_per_1k=route.cost_output_per_1k,
            request_id=str(state["request_id"]),
        )


def _capture_stream_event(line: str, state: dict[str, Any]) -> None:
    line = line.strip()
    if not line.startswith("data:"):
        return
    data = line[5:].strip()
    if not data or data == "[DONE]":
        return
    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return
    if isinstance(payload, dict) and payload.get("id"):
        state["request_id"] = str(payload["id"])
    usage = _usage_from_payload(payload)
    if usage is not None:
        state["prompt_tokens"], state["completion_tokens"] = usage


@router.get("/models")
async def list_models(
    _user: Annotated[User, Depends(_require_database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    models = (
        await session.scalars(
            select(Model).where(Model.is_active.is_(True)).order_by(Model.name.asc())
        )
    ).all()
    return {
        "object": "list",
        "data": [
            {
                "id": model.name,
                "object": "model",
                "owned_by": "cloud",
                "category": model.category,
            }
            for model in models
        ],
    }


@router.post("/chat/completions")
async def chat_completions(
    payload: ChatCompletionRequest,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(_require_database_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    routing_engine: Annotated[RoutingEngine, Depends(get_routing_engine)],
) -> Response:
    model = await session.scalar(
        select(Model).where(Model.name == payload.model, Model.is_active.is_(True))
    )
    if model is None:
        return _error(404, "model_not_found", "请求的模型不存在或未启用")

    routes, fallback_enabled = await _select_routes(
        routing_engine, payload.model, session
    )
    if not routes:
        return _error(503, "all_providers_down", "所有提供商暂时不可用，请稍后重试")

    # Selection precedes the balance check and no upstream is contacted when
    # the selected route's estimated maximum cost is unaffordable.
    try:
        await _billing_service.ensure_sufficient_balance(
            session,
            user_id=user.id,
            prompt_tokens=_estimate_prompt_tokens(payload.messages),
            max_tokens=payload.max_tokens,
            cost_input_per_1k=routes[0].cost_input_per_1k,
            cost_output_per_1k=routes[0].cost_output_per_1k,
        )
    except InsufficientBalanceError as error:
        return _error(
            402,
            "insufficient_balance",
            "账户余额不足",
            balance=error.balance,
            estimated_cost=error.estimated_cost,
        )

    upstream_payload = payload.model_dump(exclude_none=True)
    if payload.stream:
        stream_options = upstream_payload.get("stream_options")
        if not isinstance(stream_options, dict):
            stream_options = {}
        upstream_payload["stream_options"] = {**stream_options, "include_usage": True}

    if not payload.stream:
        for route in routes:
            headers = _upstream_headers(route, stream=False)
            url = _chat_completions_url(route.base_url)
            try:
                async with _new_http_client() as client:
                    upstream = await client.post(
                        url, headers=headers, json=upstream_payload
                    )
            except httpx.TimeoutException:
                _record_route_outcome(routing_engine, "record_failure", route)
                if not fallback_enabled:
                    return _error(504, "upstream_timeout", "上游提供商响应超时")
                continue
            except httpx.HTTPError:
                _record_route_outcome(routing_engine, "record_failure", route)
                if not fallback_enabled:
                    return _error(502, "upstream_error", "上游提供商请求失败")
                continue

            if not upstream.is_success:
                _record_route_outcome(routing_engine, "record_failure", route)
                if fallback_enabled:
                    continue
                content_type = upstream.headers.get("content-type", "application/json")
                return Response(
                    content=upstream.content,
                    status_code=upstream.status_code,
                    media_type=content_type.split(";", 1)[0],
                )

            _record_route_outcome(routing_engine, "record_success", route)
            try:
                body = upstream.json()
            except ValueError:
                body = None
            usage = _usage_from_payload(body)
            state = {
                "completed": True,
                "request_id": (
                    body.get("id")
                    if isinstance(body, dict) and body.get("id")
                    else uuid4().hex
                ),
                "prompt_tokens": usage[0] if usage else 0,
                "completion_tokens": usage[1] if usage else 0,
            }
            background_tasks.add_task(
                _persist_usage,
                state=state,
                user_id=user.id,
                model_name=payload.model,
                route=route,
            )
            content_type = upstream.headers.get("content-type", "application/json")
            return Response(
                content=upstream.content,
                status_code=upstream.status_code,
                media_type=content_type.split(";", 1)[0],
            )

        return _error(503, "all_providers_down", "所有提供商暂时不可用，请稍后重试")

    upstream: httpx.Response | None = None
    client: httpx.AsyncClient | None = None
    selected_route: UpstreamRoute | None = None
    for route in routes:
        client = _new_http_client()
        headers = _upstream_headers(route, stream=True)
        url = _chat_completions_url(route.base_url)
        try:
            request = client.build_request(
                "POST", url, headers=headers, json=upstream_payload
            )
            candidate_response = await client.send(request, stream=True)
        except httpx.TimeoutException:
            await client.aclose()
            _record_route_outcome(routing_engine, "record_failure", route)
            if not fallback_enabled:
                return _error(504, "upstream_timeout", "上游提供商响应超时")
            continue
        except httpx.HTTPError:
            await client.aclose()
            _record_route_outcome(routing_engine, "record_failure", route)
            if not fallback_enabled:
                return _error(502, "upstream_error", "上游提供商请求失败")
            continue

        if not candidate_response.is_success:
            content = await candidate_response.aread()
            status_code = candidate_response.status_code
            content_type = candidate_response.headers.get(
                "content-type", "application/json"
            )
            await candidate_response.aclose()
            await client.aclose()
            _record_route_outcome(routing_engine, "record_failure", route)
            if fallback_enabled:
                continue
            return Response(
                content=content,
                status_code=status_code,
                media_type=content_type.split(";", 1)[0],
            )

        upstream = candidate_response
        selected_route = route
        break

    if upstream is None or client is None or selected_route is None:
        return _error(503, "all_providers_down", "所有提供商暂时不可用，请稍后重试")

    state: dict[str, Any] = {
        "completed": False,
        "request_id": uuid4().hex,
        "prompt_tokens": 0,
        "completion_tokens": 0,
    }
    background_tasks.add_task(
        _persist_usage,
        state=state,
        user_id=user.id,
        model_name=payload.model,
        route=selected_route,
    )

    async def event_stream():
        decoder = codecs.getincrementaldecoder("utf-8")()
        text_buffer = ""
        try:
            async for chunk in upstream.aiter_bytes():
                text_buffer += decoder.decode(chunk)
                while "\n" in text_buffer:
                    line, text_buffer = text_buffer.split("\n", 1)
                    _capture_stream_event(line, state)
                yield chunk
            text_buffer += decoder.decode(b"", final=True)
            if text_buffer:
                _capture_stream_event(text_buffer, state)
            state["completed"] = True
            _record_route_outcome(routing_engine, "record_success", selected_route)
        except Exception:
            _record_route_outcome(routing_engine, "record_failure", selected_route)
            raise
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        event_stream(),
        status_code=upstream.status_code,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        background=background_tasks,
    )
