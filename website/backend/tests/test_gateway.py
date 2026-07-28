"""Focused unit and integration tests for the OpenAI-compatible gateway."""

from __future__ import annotations

import asyncio
import json
import sqlite3
from pathlib import Path
from typing import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.routing.interface import UpstreamRoute


@pytest.fixture()
def gateway_client(
    isolated_backend: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[TestClient, Path]]:
    database_path = tmp_path / "gateway-api.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database_path}")

    import app.config as config
    import app.db as db
    from app.auth.jwt import reset_revocations
    from app.models import Base

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


def _seed_gateway(database_path: Path, *, balance: float = 10.0) -> tuple[int, str]:
    from app.auth.jwt import issue_token
    from app.models import LlmProvider, Model, ProviderModel, User

    engine = create_engine(f"sqlite:///{database_path}")
    with Session(engine) as session:
        user = User(username="gateway-user", password_hash="unused", balance=balance)
        active_model = Model(
            name="qwen-plus", display_name="Qwen Plus", category="chat", is_active=True
        )
        inactive_model = Model(
            name="retired-model",
            display_name="Retired",
            category="chat",
            is_active=False,
        )
        provider = LlmProvider(
            name="mock-provider",
            base_url="https://upstream.example/v1",
            api_key_encrypted="upstream-secret",
            is_active=True,
            health_status="healthy",
        )
        session.add_all([user, active_model, inactive_model, provider])
        session.flush()
        session.add(
            ProviderModel(
                provider_id=provider.id,
                model_id=active_model.id,
                cost_input_per_1k=1.0,
                cost_output_per_1k=2.0,
                priority=100,
                is_active=True,
            )
        )
        session.commit()
        user_id = user.id
    engine.dispose()
    return user_id, issue_token("gateway-user")


def _mock_upstream(monkeypatch: pytest.MonkeyPatch, response: httpx.Response):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return response

    import app.gateway.router as gateway_router

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        gateway_router,
        "_new_http_client",
        lambda: httpx.AsyncClient(transport=transport),
    )
    return requests


def test_cost_estimate_and_upstream_url_helpers() -> None:
    from app.gateway.router import (
        ChatCompletionRequest,
        _chat_completions_url,
        _estimate_cost,
    )

    route = UpstreamRoute(1, "provider", "https://example.test/v1", "key", 1.0, 2.0)
    payload = ChatCompletionRequest(
        model="model",
        messages=[{"role": "user", "content": "hello"}],
        max_tokens=100,
    )

    assert _estimate_cost(payload, route) >= 0.2
    assert (
        _chat_completions_url(route.base_url)
        == "https://example.test/v1/chat/completions"
    )
    assert (
        _chat_completions_url("https://example.test/custom/chat/completions")
        == "https://example.test/custom/chat/completions"
    )


def test_models_requires_database_user_and_returns_only_active_models(gateway_client):
    client, database_path = gateway_client
    _, token = _seed_gateway(database_path)

    assert client.get("/api/llm/v1/models").status_code == 401

    response = client.get(
        "/api/llm/v1/models",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    assert response.json() == {
        "object": "list",
        "data": [
            {
                "id": "qwen-plus",
                "object": "model",
                "owned_by": "cloud",
                "category": "chat",
            }
        ],
    }


def test_non_streaming_proxy_forwards_and_persists_usage(
    gateway_client,
    monkeypatch: pytest.MonkeyPatch,
):
    client, database_path = gateway_client
    user_id, token = _seed_gateway(database_path)
    upstream_response = httpx.Response(
        200,
        json={
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "model": "qwen-plus",
            "choices": [
                {"index": 0, "message": {"role": "assistant", "content": "ok"}}
            ],
            "usage": {"prompt_tokens": 12, "completion_tokens": 8, "total_tokens": 20},
        },
    )
    requests = _mock_upstream(monkeypatch, upstream_response)

    response = client.post(
        "/api/llm/v1/chat/completions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "model": "qwen-plus",
            "messages": [{"role": "user", "content": "hello"}],
            "max_tokens": 10,
            "temperature": 0.2,
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["usage"]["total_tokens"] == 20
    assert len(requests) == 1
    assert str(requests[0].url) == "https://upstream.example/v1/chat/completions"
    assert requests[0].headers["authorization"] == "Bearer upstream-secret"
    assert json.loads(requests[0].content)["temperature"] == 0.2

    with sqlite3.connect(database_path) as connection:
        usage = connection.execute(
            "SELECT user_id, model_id, provider_id, prompt_tokens, "
            "completion_tokens, cost, request_id FROM usage_records"
        ).fetchone()
        balance = connection.execute(
            "SELECT balance FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    assert usage == (user_id, "qwen-plus", 1, 12, 8, 0.028, "chatcmpl-test")
    assert balance == pytest.approx((9.972,))


def test_insufficient_balance_rejects_before_upstream(
    gateway_client,
    monkeypatch: pytest.MonkeyPatch,
):
    client, database_path = gateway_client
    user_id, token = _seed_gateway(database_path, balance=0.01)
    requests = _mock_upstream(monkeypatch, httpx.Response(500))

    response = client.post(
        "/api/llm/v1/chat/completions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "model": "qwen-plus",
            "messages": [{"role": "user", "content": "hello"}],
            "max_tokens": 100,
        },
    )

    assert response.status_code == 402
    assert response.json()["error"]["code"] == "insufficient_balance"
    assert requests == []
    with sqlite3.connect(database_path) as connection:
        balance = connection.execute(
            "SELECT balance FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        usage_count = connection.execute("SELECT COUNT(*) FROM usage_records").fetchone()
    assert balance == (0.01,)
    assert usage_count == (0,)


def test_streaming_proxy_preserves_sse_and_persists_terminal_usage(
    gateway_client,
    monkeypatch: pytest.MonkeyPatch,
):
    client, database_path = gateway_client
    _, token = _seed_gateway(database_path)
    sse = (
        'data: {"id":"chatcmpl-stream","choices":[{"delta":{"content":"hi"}}]}\n\n'
        'data: {"id":"chatcmpl-stream","choices":[],"usage":'
        '{"prompt_tokens":7,"completion_tokens":3,"total_tokens":10}}\n\n'
        "data: [DONE]\n\n"
    ).encode()
    requests = _mock_upstream(
        monkeypatch,
        httpx.Response(200, content=sse, headers={"content-type": "text/event-stream"}),
    )

    response = client.post(
        "/api/llm/v1/chat/completions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "model": "qwen-plus",
            "messages": [{"role": "user", "content": "hello"}],
            "max_tokens": 10,
            "stream": True,
        },
    )

    assert response.status_code == 200, response.text
    assert response.content == sse
    forwarded = json.loads(requests[0].content)
    assert forwarded["stream"] is True
    assert forwarded["stream_options"] == {"include_usage": True}

    with sqlite3.connect(database_path) as connection:
        usage = connection.execute(
            "SELECT prompt_tokens, completion_tokens, cost, request_id FROM usage_records"
        ).fetchone()
    assert usage == (7, 3, 0.013, "chatcmpl-stream")


def test_non_streaming_proxy_falls_back_after_upstream_error(
    gateway_client,
    monkeypatch: pytest.MonkeyPatch,
):
    client, database_path = gateway_client
    _, token = _seed_gateway(database_path)

    from app.models import LlmProvider, Model, ProviderModel

    engine = create_engine(f"sqlite:///{database_path}")
    with Session(engine) as session:
        model = session.query(Model).filter_by(name="qwen-plus").one()
        fallback_provider = LlmProvider(
            name="fallback-provider",
            base_url="https://fallback.example/v1",
            api_key_encrypted="fallback-secret",
            is_active=True,
            health_status="healthy",
            avg_latency_ms=20,
        )
        session.add(fallback_provider)
        session.flush()
        session.add(
            ProviderModel(
                provider_id=fallback_provider.id,
                model_id=model.id,
                cost_input_per_1k=1.5,
                cost_output_per_1k=2.5,
                priority=50,
                is_active=True,
            )
        )
        session.commit()
        fallback_provider_id = fallback_provider.id
    engine.dispose()

    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "upstream.example":
            return httpx.Response(500, json={"error": "temporary"})
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-fallback",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "recovered"},
                    }
                ],
                "usage": {
                    "prompt_tokens": 5,
                    "completion_tokens": 4,
                    "total_tokens": 9,
                },
            },
        )

    import app.gateway.router as gateway_router

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        gateway_router,
        "_new_http_client",
        lambda: httpx.AsyncClient(transport=transport),
    )

    response = client.post(
        "/api/llm/v1/chat/completions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "model": "qwen-plus",
            "messages": [{"role": "user", "content": "hello"}],
            "max_tokens": 10,
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["id"] == "chatcmpl-fallback"
    assert [request.url.host for request in requests] == [
        "upstream.example",
        "fallback.example",
    ]
    assert requests[1].headers["authorization"] == "Bearer fallback-secret"

    with sqlite3.connect(database_path) as connection:
        provider_id = connection.execute(
            "SELECT provider_id FROM usage_records WHERE request_id = ?",
            ("chatcmpl-fallback",),
        ).fetchone()
    assert provider_id == (fallback_provider_id,)


def test_phase_one_smoke_registers_lists_models_and_proxies_chat(
    gateway_client,
    monkeypatch: pytest.MonkeyPatch,
):
    """Exercise the Phase 1 API flow in-process against a mock upstream."""
    client, database_path = gateway_client
    registration = client.post(
        "/api/auth/register",
        json={
            "username": "phase-one-smoke",
            "password": "correct horse battery staple",
            "email": "smoke@example.com",
        },
    )
    assert registration.status_code == 201, registration.text
    token = registration.json()["access_token"]

    from app.models import LlmProvider, Model, ProviderModel, User

    engine = create_engine(f"sqlite:///{database_path}")
    with Session(engine) as session:
        user = session.query(User).filter_by(username="phase-one-smoke").one()
        user.balance = 10.0
        model = Model(
            name="qwen-plus",
            display_name="Qwen Plus",
            category="chat",
            is_active=True,
        )
        provider = LlmProvider(
            name="phase-one-mock",
            base_url="https://phase-one-upstream.example/v1",
            api_key_encrypted="mock-upstream-secret",
            is_active=True,
            health_status="healthy",
        )
        session.add_all([model, provider])
        session.flush()
        session.add(
            ProviderModel(
                provider_id=provider.id,
                model_id=model.id,
                cost_input_per_1k=1.0,
                cost_output_per_1k=2.0,
                priority=100,
                is_active=True,
            )
        )
        session.commit()
    engine.dispose()

    headers = {"Authorization": f"Bearer {token}"}
    models = client.get("/api/llm/v1/models", headers=headers)
    assert models.status_code == 200, models.text
    assert [model["id"] for model in models.json()["data"]] == ["qwen-plus"]

    upstream_requests = _mock_upstream(
        monkeypatch,
        httpx.Response(
            200,
            json={
                "id": "chatcmpl-phase-one-smoke",
                "object": "chat.completion",
                "model": "qwen-plus",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "mock reply"},
                    }
                ],
                "usage": {
                    "prompt_tokens": 4,
                    "completion_tokens": 3,
                    "total_tokens": 7,
                },
            },
        ),
    )
    chat = client.post(
        "/api/llm/v1/chat/completions",
        headers=headers,
        json={
            "model": "qwen-plus",
            "messages": [{"role": "user", "content": "smoke test"}],
            "max_tokens": 10,
        },
    )

    assert chat.status_code == 200, chat.text
    assert chat.json()["choices"][0]["message"]["content"] == "mock reply"
    assert len(upstream_requests) == 1
    assert upstream_requests[0].url.host == "phase-one-upstream.example"
    assert upstream_requests[0].headers["authorization"] == "Bearer mock-upstream-secret"


def test_phase_three_checkpoint_full_billing_and_usage_flow(
    gateway_client,
    monkeypatch: pytest.MonkeyPatch,
):
    """Exercise auth -> proxy -> billing -> usage queries -> daily claim.

    Validates: Requirements 5.1, 5.2, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4
    """
    client, database_path = gateway_client
    registration = client.post(
        "/api/auth/register",
        json={
            "username": "phase-three-checkpoint",
            "password": "correct horse battery staple",
            "email": "phase-three@example.com",
        },
    )
    assert registration.status_code == 201, registration.text
    user_id = registration.json()["user"]["id"]
    headers = {
        "Authorization": f"Bearer {registration.json()['access_token']}"
    }

    from app.models import BillingConfig, LlmProvider, Model, ProviderModel, User

    engine = create_engine(f"sqlite:///{database_path}")
    with Session(engine) as session:
        user = session.get(User, user_id)
        assert user is not None
        user.balance = 10.0
        model = Model(
            name="checkpoint-model",
            display_name="Checkpoint Model",
            category="chat",
            is_active=True,
        )
        provider = LlmProvider(
            name="checkpoint-upstream",
            base_url="https://checkpoint-upstream.example/v1",
            api_key_encrypted="checkpoint-secret",
            is_active=True,
            health_status="healthy",
        )
        session.add_all(
            [
                model,
                provider,
                BillingConfig(key="daily_free_credits", value="1.25"),
            ]
        )
        session.flush()
        session.add(
            ProviderModel(
                provider_id=provider.id,
                model_id=model.id,
                cost_input_per_1k=1.0,
                cost_output_per_1k=2.0,
                priority=100,
                is_active=True,
            )
        )
        session.commit()
    engine.dispose()

    upstream_requests = _mock_upstream(
        monkeypatch,
        httpx.Response(
            200,
            json={
                "id": "chatcmpl-phase-three-checkpoint",
                "object": "chat.completion",
                "model": "checkpoint-model",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "checkpoint reply",
                        },
                    }
                ],
                "usage": {
                    "prompt_tokens": 120,
                    "completion_tokens": 80,
                    "total_tokens": 200,
                },
            },
        ),
    )

    chat = client.post(
        "/api/llm/v1/chat/completions",
        headers=headers,
        json={
            "model": "checkpoint-model",
            "messages": [{"role": "user", "content": "run checkpoint"}],
            "max_tokens": 100,
        },
    )
    assert chat.status_code == 200, chat.text
    assert chat.json()["usage"] == {
        "prompt_tokens": 120,
        "completion_tokens": 80,
        "total_tokens": 200,
    }
    assert len(upstream_requests) == 1
    assert upstream_requests[0].url.host == "checkpoint-upstream.example"
    assert upstream_requests[0].headers["authorization"] == "Bearer checkpoint-secret"

    expected_cost = 0.28
    expected_balance = 10.0 - expected_cost
    balance = client.get("/api/auth/user/balance", headers=headers)
    assert balance.status_code == 200, balance.text
    assert balance.json()["balance"] == pytest.approx(expected_balance)

    for period in ("daily", "monthly"):
        summary = client.get(
            "/api/usage/summary", params={"period": period}, headers=headers
        )
        assert summary.status_code == 200, summary.text
        assert summary.json() == {
            "period": period,
            "prompt_tokens": 120,
            "completion_tokens": 80,
            "total_tokens": 200,
            "total_cost": pytest.approx(expected_cost),
            "request_count": 1,
        }

    by_model = client.get(
        "/api/usage/by-model", params={"period": "daily"}, headers=headers
    )
    assert by_model.status_code == 200, by_model.text
    assert by_model.json() == {
        "period": "daily",
        "models": [
            {
                "model": "checkpoint-model",
                "prompt_tokens": 120,
                "completion_tokens": 80,
                "total_cost": pytest.approx(expected_cost),
                "request_count": 1,
            }
        ],
    }

    transactions = client.get(
        "/api/usage/transactions",
        params={"page": 1, "page_size": 20},
        headers=headers,
    )
    assert transactions.status_code == 200, transactions.text
    assert transactions.json()["total"] == 1
    assert transactions.json()["page"] == 1
    assert transactions.json()["page_size"] == 20
    assert transactions.json()["items"][0]["model"] == "checkpoint-model"
    assert transactions.json()["items"][0]["prompt_tokens"] == 120
    assert transactions.json()["items"][0]["completion_tokens"] == 80
    assert transactions.json()["items"][0]["cost"] == pytest.approx(expected_cost)

    first_claim = client.post("/api/billing/claim-daily", headers=headers)
    assert first_claim.status_code == 200, first_claim.text
    assert first_claim.json()["credited"] == pytest.approx(1.25)
    assert first_claim.json()["new_balance"] == pytest.approx(
        expected_balance + 1.25
    )

    repeated_claim = client.post("/api/billing/claim-daily", headers=headers)
    assert repeated_claim.status_code == 409, repeated_claim.text
    assert repeated_claim.json()["error"]["code"] == "already_claimed"

    final_balance = client.get("/api/auth/user/balance", headers=headers)
    assert final_balance.status_code == 200, final_balance.text
    assert final_balance.json()["balance"] == pytest.approx(
        expected_balance + 1.25
    )

    with sqlite3.connect(database_path) as connection:
        persisted = connection.execute(
            "SELECT user_id, model_id, provider_id, prompt_tokens, "
            "completion_tokens, cost, request_id FROM usage_records"
        ).fetchall()
    assert len(persisted) == 1
    assert persisted[0][0] == user_id
    assert persisted[0][1] == "checkpoint-model"
    assert persisted[0][2] == 1
    assert persisted[0][3:5] == (120, 80)
    assert persisted[0][5] == pytest.approx(expected_cost)
    assert persisted[0][6] == "chatcmpl-phase-three-checkpoint"
