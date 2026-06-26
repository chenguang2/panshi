"""System-level endpoints (no auth required)."""

from fastapi import APIRouter
from app.core.features import get_features

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/features")
async def get_system_features():
    """Return the current deployment's feature configuration.

    This endpoint does NOT require authentication because the frontend
    needs it during bootstrap, before the user logs in.
    """
    return get_features()
