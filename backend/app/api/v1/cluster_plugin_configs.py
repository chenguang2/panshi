import json
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.cluster import PluginConfig, ConfigVersion, Node, Route
from app.models.user import User
from app.schemas.cluster import (
    PluginConfigCreate, PluginConfigUpdate, PluginConfigResponse,
    ConfigVersionListResponse,
    DeleteClusterRequest, PublishRequest,
)
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services import edge_sync
from app.core.deps import require_permission

router = APIRouter(prefix="/clusters", tags=["clusters"], dependencies=[Depends(require_permission('clusters'))])


def _find_referencing_routes(routes: list[Route], edge_uuid: str) -> list[Route]:
    """遍历路由，返回引用了该插件组 edge_uuid 的路由清单（PLG-07 判定单点）。

    比对键是 Route.plugin_config_ids（JSON TEXT，存插件组 edge_uuid 而非 id，
    约定见 models/cluster.py）；畸形 JSON 按「不含引用」处理（与 cluster_backup
    导入期的清理语义一致），不报错阻断。删除守卫与 GET .../references 端点
    共用本判定，保证提示展示的引用清单与后端删除拦截永远同语义。
    """
    referencing: list[Route] = []
    for r in routes:
        try:
            refs = json.loads(r.plugin_config_ids) if r.plugin_config_ids else []
        except (json.JSONDecodeError, TypeError):
            refs = []
        if isinstance(refs, list) and edge_uuid in refs:
            referencing.append(r)
    return referencing


@router.get("/{cluster_id}/plugin_configs", response_model=dict)
async def list_plugin_configs(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginConfig).where(PluginConfig.cluster_id == cluster_id).order_by(PluginConfig.id))
    configs = result.scalars().all()
    # 批量回查最新发布时间 + pending 推导（published_at 回查与 pending 推导收敛在
    # edge_sync 共享单点，与全局 /plugin_configs 端点同口径，禁止各自实现）
    pub_map = await edge_sync.load_publish_time_map(db, "plugin_config", [c.id for c in configs])
    response = []
    for c in configs:
        r = PluginConfigResponse.model_validate(c)
        ts = pub_map.get(c.id)
        r.published_at = ts.isoformat() + 'Z' if ts else None
        r.pending_publish = edge_sync.derive_pending_publish(
            current_version=c.current_version,
            updated_at=c.updated_at,
            published_at=ts,
            last_publish_status=c.last_publish_status,
        )
        response.append(r)
    return {"total": len(response), "items": response}


@router.post("/{cluster_id}/plugin_configs", response_model=PluginConfigResponse)
async def create_plugin_config(cluster_id: int, data: PluginConfigCreate, db: AsyncSession = Depends(get_db), request: Request = None):
    config_data = data.model_dump()
    if config_data.get("plugins") is not None:
        config_data["plugins"] = json.dumps(config_data["plugins"])
    db_config = PluginConfig(cluster_id=cluster_id, **config_data)
    db.add(db_config)
    await db.flush()  # 审计增强前先拿 id
    audit = getattr(request.state, "audit", None)
    if audit is not None:
        audit.resource_id = db_config.id
        audit.detail = f"创建插件配置 {db_config.name}"
    await db.commit()
    await db.refresh(db_config)
    return PluginConfigResponse.model_validate(db_config)


@router.get("/{cluster_id}/plugin_configs/{config_id}", response_model=PluginConfigResponse)
async def get_plugin_config(cluster_id: int, config_id: int, db: AsyncSession = Depends(get_db)):
    config = await edge_sync.get_or_404(db, PluginConfig, id=config_id, cluster_id=cluster_id, detail="插件组不存在")
    return PluginConfigResponse.model_validate(config)


@router.put("/{cluster_id}/plugin_configs/{config_id}", response_model=PluginConfigResponse)
async def update_plugin_config(cluster_id: int, config_id: int, data: PluginConfigUpdate, db: AsyncSession = Depends(get_db), request: Request = None):
    config = await edge_sync.get_or_404(db, PluginConfig, id=config_id, cluster_id=cluster_id, detail="插件组不存在")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "plugins" and value is not None:
            value = json.dumps(value)
        setattr(config, key, value)
    audit = getattr(request.state, "audit", None)
    if audit is not None:
        audit.detail = f"更新插件配置 {config.name}"
    await db.commit()
    await db.refresh(config)
    return PluginConfigResponse.model_validate(config)


@router.delete("/{cluster_id}/plugin_configs/{config_id}")
async def delete_plugin_config(cluster_id: int, config_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db), request: Request = None):
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    config = await edge_sync.get_or_404(db, PluginConfig, id=config_id, cluster_id=cluster_id, detail="插件组不存在")
    audit = getattr(request.state, "audit", None)
    if audit is not None:
        audit.detail = f"删除插件配置 {config.name}"

    # PLG-07 前置校验（无条件下，2026-10-10 语义裁定）：仍有路由引用时不允许任何
    # 删除（含仅 Edge 侧）——网关上路由的插件引用会随 Edge-only 删除悬空。判定收敛
    # 在共享 helper _find_referencing_routes（与 GET .../references 端点同语义单点）。
    routes = (await db.execute(select(Route).where(Route.cluster_id == cluster_id))).scalars().all()
    referencing = _find_referencing_routes(routes, config.edge_uuid)
    if referencing:
        names = [r.name for r in referencing]
        shown = ", ".join(names[:3]) + ("等" if len(names) > 3 else "")
        raise HTTPException(
            status_code=400,
            detail=f"插件组被 {len(names)} 条路由引用（{shown}），请先解除引用后再删除插件组",
        )

    results = []

    if body.delete_db:
        await db.execute(ConfigVersion.__table__.delete().where(ConfigVersion.resource_type == "plugin_config", ConfigVersion.resource_id == config_id))
        await db.delete(config)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db, body.node_ids if body.node_ids else None)
        edge_results = await edge_sync.delete_on_nodes(
            cluster_id, active_nodes, config.edge_uuid,
            lambda client, uuid: client.delete_plugin_config(uuid)
        )
        results.extend(edge_results)

    return {"message": "插件组已删除", "results": results}


@router.get("/{cluster_id}/plugin_configs/{config_id}/references")
async def get_plugin_config_references(cluster_id: int, config_id: int, db: AsyncSession = Depends(get_db)):
    """删除前置引用查询（只读）：列出引用该插件组的同集群路由。

    判定与 PLG-07 删除守卫共用 _find_referencing_routes 单点——前端在删除
    确认前拉取本端点做阻断式提示，展示的引用清单与后端删除拦截永远同语义。
    """
    config = await edge_sync.get_or_404(db, PluginConfig, id=config_id, cluster_id=cluster_id, detail="插件组不存在")
    routes = (await db.execute(select(Route).where(Route.cluster_id == cluster_id))).scalars().all()
    referencing = _find_referencing_routes(routes, config.edge_uuid)
    return {
        "name": config.name,
        "referenced_by": [{"route_id": r.id, "route_name": r.name} for r in referencing],
    }


@router.post("/{cluster_id}/plugin_configs/{config_id}/publish")
async def publish_plugin_config(cluster_id: int, config_id: int, req: Optional[PublishRequest] = None, db: AsyncSession = Depends(get_db)):
    config = await edge_sync.get_or_404(db, PluginConfig, id=config_id, cluster_id=cluster_id, detail="插件组不存在")
    upstream_plugins = json.loads(config.plugins) if config.plugins else None

    config_data = {
        "id": config.id, "edge_uuid": config.edge_uuid, "name": config.name,
        "description": config.description, "plugins": upstream_plugins}
    edge_data = {"desc": config.name, "plugins": upstream_plugins or {}}

    return await edge_sync.publish_resource(
        db, cluster_id=cluster_id, resource=config, resource_type="plugin_config",
        config_data=config_data, edge_data=edge_data,
        publish_fn=lambda client: client.create_plugin_config(config.edge_uuid, edge_data),
        display_name="插件组",
        log_path=f"/edge/admin/plugin_configs/{config.edge_uuid}",
        log_resource_id=config_id, log_resource_name=config.name,
        node_ids=req.node_ids if req else None,
    )


@router.get("/{cluster_id}/plugin_configs/{config_id}/history", response_model=ConfigVersionListResponse)
async def get_plugin_config_history(cluster_id: int, config_id: int, db: AsyncSession = Depends(get_db)):
    pc_result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    pc = pc_result.scalar_one_or_none()
    return await edge_sync.list_config_versions(
        db, resource_type="plugin_config", resource_id=config_id,
        current_version=pc.current_version if pc else None)


@router.post("/{cluster_id}/plugin_configs/{config_id}/rollback/{version}")
async def rollback_plugin_config(cluster_id: int, config_id: int, version: int, db: AsyncSession = Depends(get_db)):
    async def _restore(_db, config, cfg):
        config.name = cfg.get("name", config.name)
        config.description = cfg.get("description")
        config.plugins = json.dumps(cfg["plugins"]) if cfg.get("plugins") is not None else None

    await edge_sync.rollback_resource(
        db, PluginConfig, resource_type="plugin_config", resource_id=config_id, version=version,
        not_found_detail="插件组不存在", cluster_id=cluster_id, restore_fn=_restore)
    return {"status": "ok", "message": f"插件组已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/plugin_configs/{config_id}/history/{history_id}")
async def delete_plugin_config_history(cluster_id: int, config_id: int, history_id: int, db: AsyncSession = Depends(get_db)):
    await edge_sync.delete_config_version(db, resource_type="plugin_config", resource_id=config_id, history_id=history_id)
    return {"message": "历史版本已删除"}
