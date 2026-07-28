"""Authenticated daily free-credit billing endpoint."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_username
from ..db import get_session
from ..models import User
from .service import (
    AccountNotFoundError,
    AlreadyClaimedError,
    BillingConfigurationError,
    BillingService,
)

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _utc_isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@router.post("/claim-daily")
async def claim_daily(
    username: Annotated[str, Depends(require_username)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    user_id = await session.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authenticated user no longer exists",
        )

    try:
        claim = await BillingService().claim_daily_credits(
            session, user_id=user_id
        )
        await session.commit()
    except AlreadyClaimedError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "error": {
                    "code": "already_claimed",
                    "message": "今日已领取",
                    "next_claim_at": _utc_isoformat(exc.next_claim_at),
                }
            },
        )
    except AccountNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authenticated user no longer exists",
        ) from exc
    except BillingConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "billing_configuration_error",
                "message": str(exc),
            },
        ) from exc

    return {
        "success": True,
        "credited": claim.credited,
        "new_balance": claim.new_balance,
        "next_claim_at": _utc_isoformat(claim.next_claim_at),
    }
