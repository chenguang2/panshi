import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.core.database import get_db
from app.models.cluster import PluginEnabled, RoutePlugin, PluginConfig, GlobalRule
from app.schemas.plugin_switch import PluginSwitchItem

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


async def _detect_plugin_refs(disabled_names: set[str], db: AsyncSession) -> dict:
    """Scan RoutePlugin, PluginConfig, GlobalRule for references to disabled plugins."""
    warnings: dict[str, dict[str, int]] = {}

    for name in disabled_names:
        warnings[name] = {"routes": 0, "plugin_configs": 0, "global_rules": 0}

    if not disabled_names:
        return warnings

    from sqlalchemy import or_

    # RoutePlugin — direct plugin_name column
    conditions = [RoutePlugin.plugin_name == name for name in disabled_names]
    result = await db.execute(select(RoutePlugin.plugin_name).where(or_(*conditions)))
    for row in result.scalars().all():
        warnings[row]["routes"] += 1

    # PluginConfig — plugins JSON text, scan for top-level keys
    pc_result = await db.execute(select(PluginConfig.plugins))
    for row in pc_result.scalars().all():
        if not row:
            continue
        try:
            plugins_dict = json.loads(row)
            for name in disabled_names:
                if name in plugins_dict:
                    warnings[name]["plugin_configs"] += 1
        except (json.JSONDecodeError, TypeError):
            pass

    # GlobalRule — plugins JSON text, same approach
    gr_result = await db.execute(select(GlobalRule.plugins))
    for row in gr_result.scalars().all():
        if not row:
            continue
        try:
            plugins_dict = json.loads(row)
            for name in disabled_names:
                if name in plugins_dict:
                    warnings[name]["global_rules"] += 1
        except (json.JSONDecodeError, TypeError):
            pass

    return warnings


@router.put("")
async def update_plugin_switches(
    switches: list[PluginSwitchItem],
    db: AsyncSession = Depends(get_db),
):
    disabled_names = {sw.plugin_name for sw in switches if not sw.enabled}
    warnings = await _detect_plugin_refs(disabled_names, db)

    try:
        await db.execute(PluginEnabled.__table__.delete())
        for sw in switches:
            db_item = PluginEnabled(
                plugin_name=sw.plugin_name,
                enabled=1 if sw.enabled else 0,
            )
            db.add(db_item)
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="保存插件开关失败")

    result: dict = {"message": "插件开关已更新"}
    if warnings:
        result["warnings"] = [
            {"plugin": name, "refs": refs}
            for name, refs in warnings.items()
            if any(refs.values())
        ]
    return result
