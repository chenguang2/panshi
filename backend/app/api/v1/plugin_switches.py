from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.cluster import PluginEnabled

router = APIRouter(prefix="/plugin-switches", tags=["plugin-switches"])


@router.get("")
async def list_plugin_switches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginEnabled))
    items = result.scalars().all()
    return {
        "items": [{
            "id": item.id,
            "plugin_name": item.plugin_name,
            "enabled": bool(item.enabled),
        } for item in items]
    }


@router.put("")
async def update_plugin_switches(
    switches: list[dict],
    db: AsyncSession = Depends(get_db),
):
    # 先清空所有记录
    all_records = await db.execute(select(PluginEnabled))
    for r in all_records.scalars().all():
        await db.delete(r)

    # 再写入新的
    for sw in switches:
        db_item = PluginEnabled(
            plugin_name=sw["plugin_name"],
            enabled=1 if sw.get("enabled", True) else 0,
        )
        db.add(db_item)
    await db.commit()
    return {"message": "插件开关已更新"}
