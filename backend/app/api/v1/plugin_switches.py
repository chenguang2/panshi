import json
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.core.database import get_db
from app.models.cluster import PluginEnabled, RoutePlugin, PluginConfig, GlobalRule
from app.config.plugin_definitions import BUILTIN_PLUGINS
from app.schemas.plugin_switch import PluginSwitchItem

from app.core.deps import require_permission
from app.models.user import User
from app.services.audit import enrich_audit

router = APIRouter(prefix="/plugin-switches", tags=["plugin-switches"], dependencies=[Depends(require_permission('plugin_management'))])


@router.get("")
async def list_plugin_switches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginEnabled))
    items = result.scalars().all()
    # 批 2（plugin-switches-ux-review-fixes）：引用影响前移——对全部内置插件名
    # （含尚无开关行的）返回引用计数，与 PUT 保存警告共用 _count_plugin_refs 单实现。
    names = {p["name"] for p in BUILTIN_PLUGINS}
    names |= {item.plugin_name for item in items}
    refs = await _count_plugin_refs(names, db)
    return {
        "items": [{
            "id": item.id,
            "plugin_name": item.plugin_name,
            "enabled": bool(item.enabled),
        } for item in items],
        "refs": refs,
    }


async def _count_plugin_refs(names: set[str], db: AsyncSession) -> dict:
    """Scan RoutePlugin, PluginConfig, GlobalRule for references to the given plugin names.

    单一实现（plugin-switches-ux-review-fixes 批 2）：GET 引用预览与 PUT 保存警告共用，
    杜绝两套口径。返回 {name: {routes, plugin_configs, global_rules}}（无引用为 0）。
    """
    counts: dict[str, dict[str, int]] = {}

    for name in names:
        counts[name] = {"routes": 0, "plugin_configs": 0, "global_rules": 0}

    if not names:
        return counts

    from sqlalchemy import or_

    # RoutePlugin — direct plugin_name column
    conditions = [RoutePlugin.plugin_name == name for name in names]
    result = await db.execute(select(RoutePlugin.plugin_name).where(or_(*conditions)))
    for row in result.scalars().all():
        counts[row]["routes"] += 1

    # PluginConfig — plugins JSON text, scan for top-level keys
    pc_result = await db.execute(select(PluginConfig.plugins))
    for row in pc_result.scalars().all():
        if not row:
            continue
        try:
            plugins_dict = json.loads(row)
            for name in names:
                if name in plugins_dict:
                    counts[name]["plugin_configs"] += 1
        except (json.JSONDecodeError, TypeError):
            pass

    # GlobalRule — plugins JSON text, same approach
    gr_result = await db.execute(select(GlobalRule.plugins))
    for row in gr_result.scalars().all():
        if not row:
            continue
        try:
            plugins_dict = json.loads(row)
            for name in names:
                if name in plugins_dict:
                    counts[name]["global_rules"] += 1
        except (json.JSONDecodeError, TypeError):
            pass

    return counts


async def _detect_plugin_refs(disabled_names: set[str], db: AsyncSession) -> dict:
    """Deprecated wrapper kept for PUT: zero-count entries included then filtered at response time."""
    return await _count_plugin_refs(disabled_names, db)


@router.put("")
async def update_plugin_switches(
    switches: list[PluginSwitchItem],
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission('plugin_management')),
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
        enrich_audit(request, detail="更新插件开关")
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
