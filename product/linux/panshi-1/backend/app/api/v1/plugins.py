from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.cluster import PluginEnabled
from app.config.plugin_definitions import BUILTIN_PLUGINS
from app.core.features import get_enabled_plugins

router = APIRouter(prefix="/plugins", tags=["plugins"])


@router.get("/builtin")
async def get_builtin_plugins(
    all: bool = False,
    db: AsyncSession = Depends(get_db),
):
    plugins = BUILTIN_PLUGINS

    # Layer 1: features.yaml enabled_plugins whitelist (hard upper bound).
    # Even when all=1, this restriction applies — the whitelist represents
    # the deployment-level contract, not a user preference.
    enabled_list = get_enabled_plugins()
    if enabled_list:
        enabled_set = set(enabled_list)
        plugins = [p for p in plugins if p["name"] in enabled_set]

    # Layer 2: DB-level PluginEnabled table (user-managed switch).
    # Skipped when all=1 (management page shows everything the deployment allows).
    if not all:
        result = await db.execute(select(PluginEnabled))
        switches = result.scalars().all()
        if switches:
            disabled_names = {s.plugin_name for s in switches if s.enabled == 0}
            plugins = [p for p in plugins if p["name"] not in disabled_names]

    return {"plugins": plugins}
