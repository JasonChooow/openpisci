"""Admin management API router.

Provides CRUD endpoints for:
- Providers (LLM upstream providers)
- Models (model catalog + provider mappings)
- Routing (per-model routing strategy configuration)
- Users (user management, balance adjustment, role changes)
- Billing config (global billing key/value settings)

All endpoints require a valid admin JWT (via ``admin_required`` dependency).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import (
    BillingConfig,
    LlmProvider,
    Model,
    ModelRoutingConfig,
    ProviderModel,
    User,
)
from .auth import admin_required

router = APIRouter(prefix="/api/admin", tags=["admin-management"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class ProviderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    base_url: str = Field(min_length=1, max_length=512)
    api_key_encrypted: str = Field(default="")
    is_active: bool = True


class ProviderUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    api_key_encrypted: str | None = None
    is_active: bool | None = None


class ModelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    category: str = "chat"
    is_active: bool = True


class ModelUpdate(BaseModel):
    name: str | None = None
    display_name: str | None = None
    description: str | None = None
    category: str | None = None
    is_active: bool | None = None


class ProviderModelCreate(BaseModel):
    provider_id: int
    cost_input_per_1k: float = Field(ge=0)
    cost_output_per_1k: float = Field(ge=0)
    priority: int = 0
    is_active: bool = True


class RoutingConfigUpdate(BaseModel):
    strategy: str = Field(min_length=1)
    fallback_chain: list[int] | None = None
    rate_limit_rpm: int = Field(default=60, ge=1)


class UserBalanceUpdate(BaseModel):
    amount: float  # positive = add, negative = subtract
    reason: str = ""


class UserRoleUpdate(BaseModel):
    role: str = Field(min_length=1, max_length=20)


class BillingConfigItem(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    value: str


# ---------------------------------------------------------------------------
# Provider CRUD
# ---------------------------------------------------------------------------


@router.get("/providers")
async def list_providers(
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """List all LLM providers."""
    result = await session.execute(select(LlmProvider).order_by(LlmProvider.id))
    providers = result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "base_url": p.base_url,
            "is_active": p.is_active,
            "health_status": p.health_status,
            "avg_latency_ms": p.avg_latency_ms,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in providers
    ]


@router.post("/providers", status_code=status.HTTP_201_CREATED)
async def create_provider(
    body: ProviderCreate,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Add a new LLM provider."""
    provider = LlmProvider(
        name=body.name,
        base_url=body.base_url,
        api_key_encrypted=body.api_key_encrypted,
        is_active=body.is_active,
    )
    session.add(provider)
    await session.commit()
    await session.refresh(provider)
    return {
        "id": provider.id,
        "name": provider.name,
        "base_url": provider.base_url,
        "is_active": provider.is_active,
        "health_status": provider.health_status,
        "avg_latency_ms": provider.avg_latency_ms,
    }


@router.put("/providers/{provider_id}")
async def update_provider(
    provider_id: int,
    body: ProviderUpdate,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update an existing provider."""
    provider = await session.get(LlmProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="provider not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(provider, key, value)
    await session.commit()
    await session.refresh(provider)
    return {
        "id": provider.id,
        "name": provider.name,
        "base_url": provider.base_url,
        "is_active": provider.is_active,
        "health_status": provider.health_status,
        "avg_latency_ms": provider.avg_latency_ms,
    }


@router.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(
    provider_id: int,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Delete a provider."""
    provider = await session.get(LlmProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="provider not found")
    await session.delete(provider)
    await session.commit()


@router.post("/providers/{provider_id}/health-check")
async def trigger_health_check(
    provider_id: int,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Trigger a health check for a specific provider.

    In a production system this would make an actual HTTP request to the
    provider's base_url. For now, we toggle health_status to 'healthy'
    and reset latency as a placeholder.
    """
    provider = await session.get(LlmProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="provider not found")
    # Placeholder: mark as healthy. Real implementation would probe the API.
    provider.health_status = "healthy"
    await session.commit()
    await session.refresh(provider)
    return {
        "id": provider.id,
        "name": provider.name,
        "health_status": provider.health_status,
        "avg_latency_ms": provider.avg_latency_ms,
    }


# ---------------------------------------------------------------------------
# Model CRUD
# ---------------------------------------------------------------------------


@router.get("/models")
async def list_models(
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """List all models."""
    result = await session.execute(select(Model).order_by(Model.id))
    models = result.scalars().all()
    return [
        {
            "id": m.id,
            "name": m.name,
            "display_name": m.display_name,
            "description": m.description,
            "category": m.category,
            "is_active": m.is_active,
        }
        for m in models
    ]


@router.post("/models", status_code=status.HTTP_201_CREATED)
async def create_model(
    body: ModelCreate,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Add a new model to the catalog."""
    model = Model(
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        category=body.category,
        is_active=body.is_active,
    )
    session.add(model)
    await session.commit()
    await session.refresh(model)
    return {
        "id": model.id,
        "name": model.name,
        "display_name": model.display_name,
        "description": model.description,
        "category": model.category,
        "is_active": model.is_active,
    }


@router.put("/models/{model_id}")
async def update_model(
    model_id: int,
    body: ModelUpdate,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update an existing model."""
    model = await session.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="model not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(model, key, value)
    await session.commit()
    await session.refresh(model)
    return {
        "id": model.id,
        "name": model.name,
        "display_name": model.display_name,
        "description": model.description,
        "category": model.category,
        "is_active": model.is_active,
    }


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    model_id: int,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Delete a model."""
    model = await session.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="model not found")
    await session.delete(model)
    await session.commit()


@router.get("/models/{model_id}/providers")
async def get_model_providers(
    model_id: int,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Get provider mappings for a specific model."""
    model = await session.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="model not found")
    result = await session.execute(
        select(ProviderModel).where(ProviderModel.model_id == model_id)
    )
    mappings = result.scalars().all()
    return [
        {
            "id": pm.id,
            "provider_id": pm.provider_id,
            "model_id": pm.model_id,
            "cost_input_per_1k": pm.cost_input_per_1k,
            "cost_output_per_1k": pm.cost_output_per_1k,
            "priority": pm.priority,
            "is_active": pm.is_active,
        }
        for pm in mappings
    ]


@router.post("/models/{model_id}/providers", status_code=status.HTTP_201_CREATED)
async def add_model_provider(
    model_id: int,
    body: ProviderModelCreate,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Add a provider mapping for a model."""
    model = await session.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="model not found")
    provider = await session.get(LlmProvider, body.provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="provider not found")
    pm = ProviderModel(
        provider_id=body.provider_id,
        model_id=model_id,
        cost_input_per_1k=body.cost_input_per_1k,
        cost_output_per_1k=body.cost_output_per_1k,
        priority=body.priority,
        is_active=body.is_active,
    )
    session.add(pm)
    await session.commit()
    await session.refresh(pm)
    return {
        "id": pm.id,
        "provider_id": pm.provider_id,
        "model_id": pm.model_id,
        "cost_input_per_1k": pm.cost_input_per_1k,
        "cost_output_per_1k": pm.cost_output_per_1k,
        "priority": pm.priority,
        "is_active": pm.is_active,
    }


# ---------------------------------------------------------------------------
# Routing configuration
# ---------------------------------------------------------------------------


@router.get("/routing")
async def list_routing_configs(
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """List all routing configurations."""
    result = await session.execute(
        select(ModelRoutingConfig).order_by(ModelRoutingConfig.model_id)
    )
    configs = result.scalars().all()
    return [
        {
            "id": c.id,
            "model_id": c.model_id,
            "strategy": c.strategy,
            "fallback_chain": c.fallback_chain,
            "rate_limit_rpm": c.rate_limit_rpm,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in configs
    ]


@router.put("/routing/{model_id}")
async def update_routing_config(
    model_id: int,
    body: RoutingConfigUpdate,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update or create routing configuration for a model."""
    model = await session.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="model not found")

    result = await session.execute(
        select(ModelRoutingConfig).where(ModelRoutingConfig.model_id == model_id)
    )
    config = result.scalar_one_or_none()

    if config is None:
        config = ModelRoutingConfig(
            model_id=model_id,
            strategy=body.strategy,
            fallback_chain=body.fallback_chain,
            rate_limit_rpm=body.rate_limit_rpm,
        )
        session.add(config)
    else:
        config.strategy = body.strategy
        config.fallback_chain = body.fallback_chain
        config.rate_limit_rpm = body.rate_limit_rpm

    await session.commit()
    await session.refresh(config)
    return {
        "id": config.id,
        "model_id": config.model_id,
        "strategy": config.strategy,
        "fallback_chain": config.fallback_chain,
        "rate_limit_rpm": config.rate_limit_rpm,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------


@router.get("/users")
async def list_users(
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """List users with pagination."""
    offset = (page - 1) * page_size
    total_result = await session.execute(select(func.count(User.id)))
    total = total_result.scalar() or 0

    result = await session.execute(
        select(User).order_by(User.id).offset(offset).limit(page_size)
    )
    users = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "phone": u.phone,
                "balance": u.balance,
                "role": u.role,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Get user details."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "phone": user.phone,
        "balance": user.balance,
        "role": user.role,
        "daily_claim_date": user.daily_claim_date.isoformat() if user.daily_claim_date else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.put("/users/{user_id}/balance")
async def update_user_balance(
    user_id: int,
    body: UserBalanceUpdate,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Adjust a user's balance (add or subtract)."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    new_balance = user.balance + body.amount
    if new_balance < 0:
        raise HTTPException(
            status_code=400, detail="balance cannot become negative"
        )
    user.balance = new_balance
    await session.commit()
    await session.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "balance": user.balance,
        "adjustment": body.amount,
        "reason": body.reason,
    }


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    body: UserRoleUpdate,
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Change a user's role."""
    valid_roles = {"user", "vip", "banned"}
    if body.role not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"invalid role, must be one of: {', '.join(sorted(valid_roles))}",
        )
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    user.role = body.role
    await session.commit()
    await session.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
    }


# ---------------------------------------------------------------------------
# Billing configuration
# ---------------------------------------------------------------------------


@router.get("/billing/config")
async def get_billing_config(
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Get all global billing configuration entries."""
    result = await session.execute(select(BillingConfig).order_by(BillingConfig.key))
    configs = result.scalars().all()
    return [
        {
            "id": c.id,
            "key": c.key,
            "value": c.value,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in configs
    ]


@router.put("/billing/config")
async def update_billing_config(
    body: list[BillingConfigItem],
    _admin: Annotated[str, Depends(admin_required)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update billing configuration (upsert key/value pairs)."""
    results = []
    for item in body:
        existing = await session.execute(
            select(BillingConfig).where(BillingConfig.key == item.key)
        )
        config = existing.scalar_one_or_none()
        if config is None:
            config = BillingConfig(key=item.key, value=item.value)
            session.add(config)
        else:
            config.value = item.value
        await session.flush()
        results.append({"key": config.key, "value": config.value})
    await session.commit()
    return results
