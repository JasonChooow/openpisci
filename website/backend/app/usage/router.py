"""Bearer-authenticated usage summary and transaction endpoints."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_username
from ..db import get_session
from ..models import User
from .service import UsagePeriod, UsageService

router = APIRouter(prefix="/api/usage", tags=["usage"])


async def _authenticated_user_id(
    username: Annotated[str, Depends(require_username)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> int:
    user_id = await session.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authenticated user no longer exists",
        )
    return user_id


def _utc_isoformat(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


@router.get("/summary")
async def usage_summary(
    user_id: Annotated[int, Depends(_authenticated_user_id)],
    session: Annotated[AsyncSession, Depends(get_session)],
    period: Annotated[UsagePeriod, Query()] = UsagePeriod.DAILY,
):
    summary = await UsageService().get_summary(
        session, user_id=user_id, period=period
    )
    return {
        "period": period.value,
        "prompt_tokens": summary.prompt_tokens,
        "completion_tokens": summary.completion_tokens,
        "total_tokens": summary.total_tokens,
        "total_cost": summary.total_cost,
        "request_count": summary.request_count,
    }


@router.get("/by-model")
async def usage_by_model(
    user_id: Annotated[int, Depends(_authenticated_user_id)],
    session: Annotated[AsyncSession, Depends(get_session)],
    period: Annotated[UsagePeriod, Query()] = UsagePeriod.DAILY,
):
    models = await UsageService().get_by_model(
        session, user_id=user_id, period=period
    )
    return {
        "period": period.value,
        "models": [
            {
                "model": item.model,
                "prompt_tokens": item.prompt_tokens,
                "completion_tokens": item.completion_tokens,
                "total_cost": item.total_cost,
                "request_count": item.request_count,
            }
            for item in models
        ],
    }


@router.get("/transactions")
async def usage_transactions(
    user_id: Annotated[int, Depends(_authenticated_user_id)],
    session: Annotated[AsyncSession, Depends(get_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    start_date: date | None = None,
    end_date: date | None = None,
):
    if start_date is not None and end_date is not None and end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="end_date must be on or after start_date",
        )
    result = await UsageService().get_transactions(
        session,
        user_id=user_id,
        page=page,
        page_size=page_size,
        start_date=start_date,
        end_date=end_date,
    )
    return {
        "total": result.total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": record.id,
                "model": record.model_id,
                "prompt_tokens": record.prompt_tokens,
                "completion_tokens": record.completion_tokens,
                "cost": record.cost,
                "created_at": _utc_isoformat(record.created_at),
            }
            for record in result.items
        ],
    }
