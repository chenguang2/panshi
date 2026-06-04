from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.cluster import PluginEnabled
from app.config.plugin_definitions import BUILTIN_PLUGINS

router = APIRouter(prefix="/plugins", tags=["plugins"])


@router.get("/builtin")
async def get_builtin_plugins(
    all: bool = False,
    db: AsyncSession = Depends(get_db),
):
    # all=1 时返回全部，用于管理页面
    if all:
        return {"plugins": BUILTIN_PLUGINS}

    # 检查是否有插件开关记录，无记录则返回全部
    result = await db.execute(select(PluginEnabled))
    switches = result.scalars().all()
    if not switches:
        return {"plugins": BUILTIN_PLUGINS}

    disabled_names = {s.plugin_name for s in switches if s.enabled == 0}
    filtered = [p for p in BUILTIN_PLUGINS if p["name"] not in disabled_names]
    return {"plugins": filtered}
