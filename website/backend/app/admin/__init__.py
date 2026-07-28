"""Admin panel API module: authentication, provider/model/routing/user/billing management.

This module provides:
- ``router``: the admin auth APIRouter (POST /api/admin/auth/login)
- ``management_router``: CRUD endpoints for providers/models/routing/users/billing
- ``admin_required``: FastAPI dependency for protected admin endpoints
"""

from .auth import admin_required, router
from .management import router as management_router

__all__ = ["admin_required", "management_router", "router"]
