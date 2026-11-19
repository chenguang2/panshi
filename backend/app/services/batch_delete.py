"""批量删除单一实现（r24，用户裁定 U2：契约统一）。

**契约**：一个 ids 数组 → 一条 `{message, results: [...]}`，每条含
``{<idKey>, <nameKey>, status, results: [{scope, status, node?, message?, error?}], error?}``。
五个资源域（路由 / 插件组 / 全局规则 / 四层代理 / DNS 代理）与两种端点形态
（集群作用域 `/clusters/{id}/<res>`、全局跨集群 `/<res>`）都走本模块，禁止各端点复制循环体。

**单条失败不阻塞其余条**（既有约定）：不存在 / 无权限 / 被引用 / Edge 失败都只标记该条。

**权限（U2 硬约束）**：全局端点必须逐条校验 `UserCluster` 授权——未授权集群的条目
``status=failed`` + 原因「无权限操作该集群」，**不得整体 403**，否则是权限放大。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import (
    ConfigVersion, GlobalRule, PluginConfig, PluginMetadata, Route, RoutePlugin,
)
from app.models.user import User, UserCluster
from app.services import edge_sync, plugin_config_refs


@dataclass
class KindSpec:
    """一类可批量删除资源的差异点（其余流程完全共用）。"""

    kind: str
    model: Any
    resource_type: str
    id_key: str
    name_key: str
    edge_delete: Callable[[Any, str], Awaitable[Any]]
    missing_detail: str
    #: 删除前校验：返回中文原因即视为该条失败（如插件组的 PLG-07 引用守卫）
    precheck: Optional[Callable[[Any, AsyncSession], Awaitable[Optional[str]]]] = None
    #: 数据库删除前的附带清理（如路由的 RoutePlugin 关联行）
    purge_related: Optional[Callable[[Any, AsyncSession], Awaitable[None]]] = None
    #: Edge 侧定位字段：默认 edge_uuid；插件元数据按 plugin_name 定位
    edge_identifier: str = "edge_uuid"


async def _purge_route_plugins(route: Any, db: AsyncSession) -> None:
    await db.execute(RoutePlugin.__table__.delete().where(RoutePlugin.route_id == route.id))


async def _plugin_config_precheck(config: Any, db: AsyncSession) -> Optional[str]:
    """PLG-07：被同集群路由引用的插件组禁止删除（含仅 Edge 侧删除）。"""
    routes = (await db.execute(select(Route).where(Route.cluster_id == config.cluster_id))).scalars().all()
    referencing = plugin_config_refs.find_referencing(routes, config.edge_uuid)
    if not referencing:
        return None
    names = [r.name for r in referencing]
    shown = ", ".join(names[:3]) + ("等" if len(names) > 3 else "")
    return f"被 {len(names)} 条路由引用（{shown}），请先解除引用"


KINDS: dict[str, KindSpec] = {
    "route": KindSpec(
        kind="route",
        model=Route,
        resource_type="route",
        id_key="route_id",
        name_key="route_name",
        edge_delete=lambda client, uuid: client.delete_route(uuid),
        missing_detail="路由不存在",
        purge_related=_purge_route_plugins,
    ),
    "plugin_config": KindSpec(
        kind="plugin_config",
        model=PluginConfig,
        resource_type="plugin_config",
        id_key="config_id",
        name_key="config_name",
        edge_delete=lambda client, uuid: client.delete_plugin_config(uuid),
        missing_detail="插件组不存在",
        precheck=_plugin_config_precheck,
    ),
    "plugin_metadata": KindSpec(
        kind="plugin_metadata",
        model=PluginMetadata,
        resource_type="plugin_metadata",
        id_key="metadata_id",
        name_key="plugin_name",
        # Edge 侧按 plugin_name 定位（不是 edge_uuid），与单删端点一致
        edge_delete=lambda client, name: client.delete_plugin_metadata(name),
        missing_detail="插件元数据不存在",
        edge_identifier="plugin_name",
    ),
    "global_rule": KindSpec(
        kind="global_rule",
        model=GlobalRule,
        resource_type="global_rule",
        id_key="rule_id",
        name_key="rule_name",
        edge_delete=lambda client, uuid: client.delete_global_rule(uuid),
        missing_detail="全局规则不存在",
    ),
}


async def allowed_cluster_ids(db: AsyncSession, user: Optional[User]) -> Optional[set[int]]:
    """非 admin 用户的授权集群集合；admin / 无用户上下文返回 None（= 不限制）。"""
    if user is None or getattr(user, "role", "admin") == "admin":
        return None
    rows = await db.execute(select(UserCluster.cluster_id).where(UserCluster.user_id == user.id))
    return {r[0] for r in rows.all()}


async def batch_delete(
    kind: str,
    ids: list[int],
    *,
    db: AsyncSession,
    delete_db: bool,
    delete_edge: bool,
    node_ids: Optional[list[int]] = None,
    user: Optional[User] = None,
    cluster_id: Optional[int] = None,
) -> dict:
    """按 kind 批量删除并返回逐条结果（唯一实现）。

    ``cluster_id`` 有值时限制在该集群内（集群作用域端点）；无值时跨集群（全局端点），
    并按 ``user`` 的授权集合逐条过滤。
    """
    spec = KINDS[kind]
    if not ids:
        raise HTTPException(status_code=400, detail=f"{spec.id_key} 不能为空")
    if not delete_db and not delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    allowed = await allowed_cluster_ids(db, user)

    results: list[dict] = []
    for rid in ids:
        item: dict = {spec.id_key: rid, spec.name_key: "", "status": "failed", "results": []}
        try:
            # 逐条取（`Session.get` 命中身份映射；跨条失败回滚后能自动刷新状态）。
            # 不预先批量 select：回滚会把已加载对象置为 expired，批量缓存会在
            # 后续条目上触发 ObjectDeletedError/脏状态（route-batch 既有回归覆盖）。
            resource = await db.get(spec.model, rid)
            if resource is not None and cluster_id is not None and resource.cluster_id != cluster_id:
                resource = None
            if resource is None:
                item["error"] = spec.missing_detail if cluster_id is not None else "资源不存在或不属于当前集群"
                results.append(item)
                continue

            # 名称字段按 kind 声明取（插件元数据是 plugin_name，其余是 name）
            item[spec.name_key] = getattr(resource, spec.name_key, None) or getattr(resource, "name", "") or ""
            if allowed is not None and resource.cluster_id not in allowed:
                item["error"] = "无权限操作该集群"
                results.append(item)
                continue

            if spec.precheck is not None:
                reason = await spec.precheck(resource, db)
                if reason:
                    item["error"] = reason
                    results.append(item)
                    continue

            active_nodes = (
                await edge_sync.get_active_nodes(resource.cluster_id, db, node_ids or None)
                if delete_edge
                else []
            )

            if delete_db:
                await db.execute(
                    ConfigVersion.__table__.delete().where(
                        ConfigVersion.resource_type == spec.resource_type,
                        ConfigVersion.resource_id == rid,
                    )
                )
                if spec.purge_related is not None:
                    await spec.purge_related(resource, db)
                await db.delete(resource)
                await db.commit()
                item["results"].append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

            if delete_edge:
                identifier = getattr(resource, spec.edge_identifier, None)
                if not identifier:
                    item["results"].append(
                        {"scope": "edge", "status": "skipped", "message": "该资源缺少 Edge 标识，跳过 Edge 同步"}
                    )
                else:
                    item["results"].extend(
                        await edge_sync.delete_on_nodes(
                            resource.cluster_id, active_nodes, identifier, spec.edge_delete
                        )
                    )

            item["status"] = "success"
        except HTTPException as e:
            item["error"] = str(e.detail)
        except Exception as e:  # noqa: BLE001 - 单条失败不阻塞其余（既有约定）
            await db.rollback()
            item["error"] = str(e)
        results.append(item)

    return {"message": f"批量删除完成: {len(results)} 条", "results": results}
