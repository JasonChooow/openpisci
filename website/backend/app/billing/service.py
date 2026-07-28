"""Concurrency-safe token billing for successful gateway requests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
import json
from typing import NoReturn

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import BillingConfig, UsageRecord, User


@dataclass(frozen=True, slots=True)
class InsufficientBalanceError(Exception):
    """Raised when an account cannot cover a request's estimated maximum cost."""

    balance: float
    estimated_cost: float

    def __str__(self) -> str:
        return "account balance is insufficient for the estimated request cost"


class AccountNotFoundError(LookupError):
    """Raised when billing is requested for a user that no longer exists."""


class BillingConfigurationError(RuntimeError):
    """Raised when a required billing setting is absent or invalid."""


@dataclass(frozen=True, slots=True)
class DailyCreditClaim:
    """Result of one successful daily free-credit claim."""

    credited: float
    new_balance: float
    next_claim_at: datetime


@dataclass(frozen=True, slots=True)
class AlreadyClaimedError(Exception):
    """Raised when an account has already claimed credits for the UTC day."""

    next_claim_at: datetime

    def __str__(self) -> str:
        return "daily free credits have already been claimed"


class BillingService:
    """Calculate request costs, preflight balances, and persist actual usage.

    The user row is locked before charging on PostgreSQL. The balance mutation
    also uses ``balance = balance - cost`` in SQL, so databases that ignore
    ``SELECT FOR UPDATE`` (notably the SQLite development/test backend) still
    cannot lose concurrent deductions. ``UsageRecord.request_id`` supplies the
    idempotency key; the lock and unique constraint ensure one deduction per
    successful upstream request.
    """

    DEFAULT_MAX_TOKENS = 1024

    @staticmethod
    def calculate_cost(
        *,
        prompt_tokens: int,
        completion_tokens: int,
        cost_input_per_1k: float,
        cost_output_per_1k: float,
    ) -> float:
        """Return the exact configured cost for non-negative actual token counts."""
        BillingService._validate_tokens_and_prices(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_input_per_1k=cost_input_per_1k,
            cost_output_per_1k=cost_output_per_1k,
        )
        return (
            prompt_tokens * cost_input_per_1k
            + completion_tokens * cost_output_per_1k
        ) / 1000

    @classmethod
    def estimate_cost(
        cls,
        *,
        prompt_tokens: int,
        max_tokens: int | None,
        cost_input_per_1k: float,
        cost_output_per_1k: float,
    ) -> float:
        """Estimate the maximum request cost from prompt and completion limits."""
        completion_tokens = cls.DEFAULT_MAX_TOKENS if max_tokens is None else max_tokens
        if completion_tokens < 1:
            raise ValueError("max_tokens must be positive")
        return cls.calculate_cost(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_input_per_1k=cost_input_per_1k,
            cost_output_per_1k=cost_output_per_1k,
        )

    async def ensure_sufficient_balance(
        self,
        session: AsyncSession,
        *,
        user_id: int,
        prompt_tokens: int,
        max_tokens: int | None,
        cost_input_per_1k: float,
        cost_output_per_1k: float,
    ) -> float:
        """Return estimated cost, or reject without mutating the account balance."""
        estimated_cost = self.estimate_cost(
            prompt_tokens=prompt_tokens,
            max_tokens=max_tokens,
            cost_input_per_1k=cost_input_per_1k,
            cost_output_per_1k=cost_output_per_1k,
        )
        balance = await session.scalar(select(User.balance).where(User.id == user_id))
        if balance is None:
            raise AccountNotFoundError(f"user {user_id} does not exist")
        current_balance = float(balance)
        if current_balance < estimated_cost:
            raise InsufficientBalanceError(current_balance, estimated_cost)
        return estimated_cost

    async def record_usage(
        self,
        session: AsyncSession,
        *,
        user_id: int,
        model_name: str,
        provider_id: int,
        prompt_tokens: int,
        completion_tokens: int,
        cost_input_per_1k: float,
        cost_output_per_1k: float,
        request_id: str,
    ) -> UsageRecord:
        """Atomically deduct actual cost and persist one idempotent usage record."""
        normalized_request_id = request_id.strip()[:64]
        if not normalized_request_id:
            raise ValueError("request_id cannot be empty")
        if not model_name or len(model_name) > 128:
            raise ValueError("model_name must contain at most 128 characters")

        cost = self.calculate_cost(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_input_per_1k=cost_input_per_1k,
            cost_output_per_1k=cost_output_per_1k,
        )

        # PostgreSQL serializes all charges for an account at this point. Query
        # the idempotency key only after acquiring the lock so a waiter observes
        # the first transaction's committed UsageRecord.
        user = await session.scalar(
            select(User).where(User.id == user_id).with_for_update()
        )
        if user is None:
            raise AccountNotFoundError(f"user {user_id} does not exist")

        existing = await session.scalar(
            select(UsageRecord).where(
                UsageRecord.request_id == normalized_request_id
            )
        )
        if existing is not None:
            return existing

        record = UsageRecord(
            user_id=user_id,
            model_id=model_name,
            provider_id=provider_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost=cost,
            request_id=normalized_request_id,
        )

        try:
            # The savepoint lets a concurrent unique-key loser roll back its
            # own balance update while preserving the caller's outer transaction.
            async with session.begin_nested():
                result = await session.execute(
                    update(User)
                    .where(User.id == user_id)
                    .values(balance=User.balance - cost)
                    .execution_options(synchronize_session=False)
                )
                if result.rowcount != 1:
                    raise AccountNotFoundError(f"user {user_id} does not exist")
                session.add(record)
                await session.flush()
        except IntegrityError:
            existing = await session.scalar(
                select(UsageRecord).where(
                    UsageRecord.request_id == normalized_request_id
                )
            )
            if existing is not None:
                return existing
            raise

        return record

    async def claim_daily_credits(
        self,
        session: AsyncSession,
        *,
        user_id: int,
        now: datetime | None = None,
    ) -> DailyCreditClaim:
        """Atomically credit an account at most once per UTC calendar day."""
        current_time = now or datetime.now(timezone.utc)
        if current_time.tzinfo is None:
            raise ValueError("now must be timezone-aware")
        claim_date = current_time.astimezone(timezone.utc).date()
        next_claim_at = datetime.combine(
            claim_date + timedelta(days=1), time.min, tzinfo=timezone.utc
        )

        raw_credits = await session.scalar(
            select(BillingConfig.value).where(
                BillingConfig.key == "daily_free_credits"
            )
        )
        credits = self._parse_daily_free_credits(raw_credits)

        # The compare-and-set predicate is the concurrency guard. PostgreSQL
        # and SQLite both serialize this write, so concurrent callers cannot
        # both match the previous claim date. Balance and date are changed by
        # the same statement and therefore the same transaction.
        result = await session.execute(
            update(User)
            .where(
                User.id == user_id,
                or_(
                    User.daily_claim_date.is_(None),
                    User.daily_claim_date != claim_date,
                ),
            )
            .values(
                balance=User.balance + credits,
                daily_claim_date=claim_date,
            )
            .returning(User.balance)
            .execution_options(synchronize_session=False)
        )
        new_balance = result.scalar_one_or_none()
        if new_balance is not None:
            return DailyCreditClaim(
                credited=credits,
                new_balance=float(new_balance),
                next_claim_at=next_claim_at,
            )

        user_exists = await session.scalar(
            select(User.id).where(User.id == user_id)
        )
        if user_exists is None:
            raise AccountNotFoundError(f"user {user_id} does not exist")
        raise AlreadyClaimedError(next_claim_at=next_claim_at)

    @staticmethod
    def _parse_daily_free_credits(raw_value: str | None) -> float:
        if raw_value is None:
            raise BillingConfigurationError(
                "daily_free_credits billing configuration is missing"
            )
        try:
            parsed = json.loads(
                raw_value,
                parse_float=Decimal,
                parse_int=Decimal,
                parse_constant=BillingService._reject_json_constant,
            )
        except (json.JSONDecodeError, ValueError) as exc:
            raise BillingConfigurationError(
                "daily_free_credits must be a finite non-negative JSON number"
            ) from exc
        if (
            not isinstance(parsed, Decimal)
            or not parsed.is_finite()
            or parsed < 0
        ):
            raise BillingConfigurationError(
                "daily_free_credits must be a finite non-negative JSON number"
            )
        return float(parsed)

    @staticmethod
    def _reject_json_constant(value: str) -> NoReturn:
        raise ValueError(f"invalid JSON numeric constant: {value}")

    @staticmethod
    def _validate_tokens_and_prices(
        *,
        prompt_tokens: int,
        completion_tokens: int,
        cost_input_per_1k: float,
        cost_output_per_1k: float,
    ) -> None:
        if prompt_tokens < 0 or completion_tokens < 0:
            raise ValueError("token counts cannot be negative")
        if cost_input_per_1k < 0 or cost_output_per_1k < 0:
            raise ValueError("token prices cannot be negative")
