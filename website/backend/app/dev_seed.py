"""Local-dev bootstrap: create schema defaults and a demo account."""

from __future__ import annotations

import logging

from sqlalchemy import select

from .auth.password import hash_password
from .db import session_scope
from .models import BillingConfig, User

logger = logging.getLogger(__name__)

DEV_USERNAME = "admin"
DEV_PASSWORD = "admin123"
DEV_EMAIL = "admin@localhost"


async def seed_local_dev() -> None:
    """Insert demo user + billing defaults when the DB is empty."""
    async with session_scope() as session:
        existing = await session.scalar(select(User).where(User.username == DEV_USERNAME))
        if existing is None:
            session.add(
                User(
                    username=DEV_USERNAME,
                    password_hash=hash_password(DEV_PASSWORD),
                    email=DEV_EMAIL,
                    phone="13800000000",
                    balance=100.0,
                    role="admin",
                )
            )
            logger.info(
                "[gateway] seeded local user %s / %s (balance=100)",
                DEV_USERNAME,
                DEV_PASSWORD,
            )
        elif not existing.phone:
            existing.phone = "13800000000"
            logger.info("[gateway] backfilled phone for local user %s", DEV_USERNAME)

        daily = await session.scalar(
            select(BillingConfig).where(BillingConfig.key == "daily_free_credits")
        )
        if daily is None:
            session.add(BillingConfig(key="daily_free_credits", value="1.0"))
            logger.info("[gateway] seeded billing_config daily_free_credits=1.0")
