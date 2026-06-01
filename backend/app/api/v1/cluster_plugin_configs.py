import json
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.cluster import Cluster, PluginConfig, ConfigVersion, Node
from app.models.user import User
from app.schemas.cluster import (
    PluginConfigCreate, PluginConfigUpdate, PluginConfigResponse,
    ConfigVersionListResponse,
    DeleteClusterRequest, PublishRequest,
)
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services.edge_logger import get_edge_logger
from app.services import edge_sync
from app.api.v1.clusters import get_current_user

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get("/{cluster_id}/plugin_configs", response_model=dict)
async def list_plugin_configs(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginConfig).where(PluginConfig.cluster_id == cluster_id).order_by(PluginConfig.id))
    configs = result.scalars().all()
    # 批量查询最新发布时间
    pc_ids = [c.id for c in configs]
    pub = await db.execute(
        select(ConfigVersion.resource_id, func.max(ConfigVersion.created_at).label("ts"))
        .where(ConfigVersion.resource_type == "plugin_config", ConfigVersion.resource_id.in_(pc_ids) if pc_ids else False)
        .group_by(ConfigVersion.resource_id)
    ) if pc_ids else None
    pub_map = {r.resource_id: r.ts for r in pub.all()} if pub else {}
    response = []
    for c in configs:
        r = PluginConfigResponse.model_validate(c)
        ts = pub_map.get(c.id)
        r.published_at = ts.isoformat() + 'Z' if ts else None
        response.append(r)
    return {"total": len(response), "items": response}


@router.post("/{cluster_id}/plugin_configs", response_model=PluginConfigResponse)
async def create_plugin_config(cluster_id: int, data: PluginConfigCreate, db: AsyncSession = Depends(get_db)):
    config_data = data.model_dump()
    if config_data.get("plugins") is not None:
        config_data["plugins"] = json.dumps(config_data["plugins"])
    db_config = PluginConfig(cluster_id=cluster_id, **config_data)
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    return PluginConfigResponse.model_validate(db_config)


@router.get("/{cluster_id}/plugin_configs/{config_id}", response_model=PluginConfigResponse)
async def get_plugin_config(cluster_id: int, config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件组不存在")
    return PluginConfigResponse.model_validate(config)


@router.put("/{cluster_id}/plugin_configs/{config_id}", response_model=PluginConfigResponse)
async def update_plugin_config(cluster_id: int, config_id: int, data: PluginConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件组不存在")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "plugins" and value is not None:
            value = json.dumps(value)
        setattr(config, key, value)
    await db.commit()
    await db.refresh(config)
    return PluginConfigResponse.model_validate(config)


@router.delete("/{cluster_id}/plugin_configs/{config_id}")
async def delete_plugin_config(cluster_id: int, config_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db)):
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件组不存在")

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


@router.post("/{cluster_id}/plugin_configs/{config_id}/publish")
async def publish_plugin_config(cluster_id: int, config_id: int, req: Optional[PublishRequest] = None, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件组不存在")
    upstream_plugins = json.loads(config.plugins) if config.plugins else None
    # Version increment and save history
    version_result = await db.execute(
        select(func.max(ConfigVersion.version)).where(
            ConfigVersion.resource_type == "plugin_config",
            ConfigVersion.resource_id == config_id
        )
    )
    latest_version = version_result.scalar() or 0
    new_version = latest_version + 1
    event_data = {
        "id": config.id,
        "edge_uuid": config.edge_uuid,
        "name": config.name,
        "description": config.description,
        "plugins": upstream_plugins}
    config_version = ConfigVersion(
        cluster_id=cluster_id,
        resource_type="plugin_config",
        resource_id=config_id,
        version=new_version,
        config=json.dumps(event_data))
    db.add(config_version)
    config.current_version = new_version
    await db.commit()
    edge_data = {
        "desc": config.name,
        "plugins": upstream_plugins or {},
    }

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()

    if req and req.node_ids:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db, req.node_ids)
    else:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db)

    if not active_nodes:
        return {"status": "error", "message": "集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    edge_logger = get_edge_logger()
    results = []
    success_count = 0
    fail_count = 0
    for node in active_nodes:
        node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}
        try:
            client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)
            encrypted = client._encrypt(json.dumps(event_data).encode())
            response = client.create_plugin_config(config.edge_uuid, edge_data)

            edge_logger.log_plugin_config_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                config_id=config_id,
                config_name=config.name,
                method="PUT",
                path=f"/edge/admin/plugin_configs/{config.edge_uuid}",
                request_body=edge_data,
                encrypted_body=encrypted,
                response_status=201,
                response_body=response,
                status="SUCCESS"
            )

            node_result["status"] = "success"
            node_result["response"] = response
            success_count += 1
        except (EdgeConnectionError, EdgeAPIError) as e:
            edge_logger.log_plugin_config_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                config_id=config_id,
                config_name=config.name,
                method="PUT",
                path=f"/edge/admin/plugin_configs/{config.edge_uuid}",
                request_body=edge_data,
                encrypted_body=None,
                response_status=e.status_code if isinstance(e, EdgeAPIError) else None,
                response_body=e.response_body if isinstance(e, EdgeAPIError) else None,
                status="FAILED",
                error=str(e)
            )
            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1
        results.append(node_result)

    return edge_sync.build_publish_response(results, success_count, fail_count, len(active_nodes), "插件组", new_version)


@router.get("/{cluster_id}/plugin_configs/{config_id}/history", response_model=ConfigVersionListResponse)
async def get_plugin_config_history(cluster_id: int, config_id: int, db: AsyncSession = Depends(get_db)):
    query = select(ConfigVersion).where(
        ConfigVersion.resource_type == "plugin_config",
        ConfigVersion.resource_id == config_id
    ).order_by(ConfigVersion.version.desc())
    result = await db.execute(query)
    versions = result.scalars().all()
    pc_result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    pc = pc_result.scalar_one_or_none()
    return ConfigVersionListResponse(
        total=len(versions), items=versions, current_version=pc.current_version if pc else None)


@router.post("/{cluster_id}/plugin_configs/{config_id}/rollback/{version}")
async def rollback_plugin_config(cluster_id: int, config_id: int, version: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件组不存在")
    cv_result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.resource_type == "plugin_config",
        ConfigVersion.resource_id == config_id,
        ConfigVersion.version == version))
    cv = cv_result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本不存在")
    config_data = json.loads(cv.config)
    config.name = config_data.get("name", config.name)
    config.description = config_data.get("description")
    if config_data.get("plugins") is not None:
        config.plugins = json.dumps(config_data["plugins"])
    else:
        config.plugins = None
    config.current_version = version
    await db.commit()
    return {"status": "ok", "message": f"插件组已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/plugin_configs/{config_id}/history/{history_id}")
async def delete_plugin_config_history(cluster_id: int, config_id: int, history_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.id == history_id,
        ConfigVersion.resource_type == "plugin_config",
        ConfigVersion.resource_id == config_id))
    cv = result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="历史版本不存在")
    await db.delete(cv)
    await db.commit()
    return {"message": "历史版本已删除"}
