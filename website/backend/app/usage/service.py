"""Read-only, user-scoped usage aggregation and transaction queries."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from enum import Enum

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import UsageRecord


class UsagePeriod(str, Enum):
    """Supported UTC calendar periods for usage aggregations."""

    DAILY = "daily"
    MONTHLY = "monthly"


@dataclass(frozen=True, slots=True)
class UsageSummary:
    prompt_tokens: int
    completion_tokens: int
    total_cost: float
    request_count: int

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass(frozen=True, slots=True)
class ModelUsage:
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_cost: float
    request_count: int


@dataclass(frozen=True, slots=True)
class TransactionPage:
    total: int
    items: tuple[UsageRecord, ...]


class UsageService:
    """Query immutable usage records, always constrained to one user."""

    async def get_summary(
        self,
        session: AsyncSession,
        *,
        user_id: int,
        period: UsagePeriod,
        now: datetime | None = None,
    ) -> UsageSummary:
        start, end = self.period_bounds(period, now=now)
        row = (
            await session.execute(
                select(
                    func.coalesce(func.sum(UsageRecord.prompt_tokens), 0),
                    func.coalesce(func.sum(UsageRecord.completion_tokens), 0),
                    func.coalesce(func.sum(UsageRecord.cost), 0.0),
                    func.count(UsageRecord.id),
                ).where(
                    UsageRecord.user_id == user_id,
                    UsageRecord.created_at >= start,
                    UsageRecord.created_at < end,
                )
            )
        ).one()
        return UsageSummary(
            prompt_tokens=int(row[0]),
            completion_tokens=int(row[1]),
            total_cost=float(row[2]),
            request_count=int(row[3]),
        )

    async def get_by_model(
        self,
        session: AsyncSession,
        *,
        user_id: int,
        period: UsagePeriod,
        now: datetime | None = None,
    ) -> tuple[ModelUsage, ...]:
        start, end = self.period_bounds(period, now=now)
        rows = (
            await session.execute(
                select(
                    UsageRecord.model_id,
                    func.sum(UsageRecord.prompt_tokens),
                    func.sum(UsageRecord.completion_tokens),
                    func.sum(UsageRecord.cost),
                    func.count(UsageRecord.id),
                )
                .where(
                    UsageRecord.user_id == user_id,
                    UsageRecord.created_at >= start,
                    UsageRecord.created_at < end,
                )
                .group_by(UsageRecord.model_id)
                .order_by(UsageRecord.model_id.asc())
            )
        ).all()
        return tuple(
            ModelUsage(
                model=str(row[0]),
                prompt_tokens=int(row[1]),
                completion_tokens=int(row[2]),
                total_cost=float(row[3]),
                request_count=int(row[4]),
            )
            for row in rows
        )

    async def get_transactions(
        self,
        session: AsyncSession,
        *,
        user_id: int,
        page: int,
        page_size: int,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> TransactionPage:
        if page < 1:
            raise ValueError("page must be at least 1")
        if not 1 <= page_size <= 100:
            raise ValueError("page_size must be between 1 and 100")
        if start_date is not None and end_date is not None and end_date < start_date:
            raise ValueError("end_date must be on or after start_date")

        filters = [UsageRecord.user_id == user_id]
        if start_date is not None:
            filters.append(
                UsageRecord.created_at >= datetime.combine(start_date, time.min)
            )
        if end_date is not None:
            if end_date == date.max:
                filters.append(
                    UsageRecord.created_at <= datetime.combine(end_date, time.max)
                )
            else:
                filters.append(
                    UsageRecord.created_at
                    < datetime.combine(end_date + timedelta(days=1), time.min)
                )

        total = await session.scalar(
            select(func.count(UsageRecord.id)).where(*filters)
        )
        records = (
            await session.scalars(
                select(UsageRecord)
                .where(*filters)
                .order_by(UsageRecord.created_at.desc(), UsageRecord.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
        return TransactionPage(total=int(total or 0), items=tuple(records))

    @staticmethod
    def period_bounds(
        period: UsagePeriod,
        *,
        now: datetime | None = None,
    ) -> tuple[datetime, datetime]:
        """Return naive UTC half-open boundaries for SQL ``DateTime`` columns."""
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            raise ValueError("now must be timezone-aware")
        utc_now = current.astimezone(timezone.utc)
        if period == UsagePeriod.DAILY:
            start = datetime.combine(utc_now.date(), time.min)
            return start, start + timedelta(days=1)
        if period == UsagePeriod.MONTHLY:
            start = datetime(utc_now.year, utc_now.month, 1)
            if utc_now.month == 12:
                return start, datetime(utc_now.year + 1, 1, 1)
            return start, datetime(utc_now.year, utc_now.month + 1, 1)
        raise ValueError(f"unsupported usage period: {period}")
