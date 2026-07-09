from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, Dict, Any
import json

from app.core.database import get_db
from app.models.cluster import PluginMetadata, ConfigVersion, Node, Cluster
from app.schemas.cluster import DeleteClusterRequest, PublishRequest
from app.services import edge_sync
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services.edge_logger import get_edge_logger

router = APIRouter(prefix="/clusters/{cluster_id}/plugin-metadata", tags=["plugin-metadata"])


# ─── 列表 ────────────────────────────────────────────
@router.get("")
async def list_plugin_metadata(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PluginMetadata).where(PluginMetadata.cluster_id == cluster_id).order_by(PluginMetadata.id)
    )
    items = result.scalars().all()
    return {
        "total": len(items),
        "items": [{
            "id": item.id,
            "cluster_id": item.cluster_id,
            "plugin_name": item.plugin_name,
            "metadata": json.loads(item.config_data) if item.config_data else {},
            "current_version": item.current_version,
            "created_at": item.created_at.isoformat() + 'Z' if item.created_at else None,
            "updated_at": item.updated_at.isoformat() + 'Z' if item.updated_at else None
        } for item in items]
    }


# ─── 创建 ────────────────────────────────────────────
@router.post("")
async def create_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    config_data: Optional[Dict[str, Any]] = None,
    db: AsyncSession = Depends(get_db)
):
    existing = await db.execute(
        select(PluginMetadata).where(
            PluginMetadata.cluster_id == cluster_id,
            PluginMetadata.plugin_name == plugin_name
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该插件已配置")

    db_item = PluginMetadata(
        cluster_id=cluster_id,
        plugin_name=plugin_name,
        config_data=json.dumps(config_data or {}),
        current_version=None
    )
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)

    return {
        "id": db_item.id,
        "cluster_id": db_item.cluster_id,
        "plugin_name": db_item.plugin_name,
        "metadata": json.loads(db_item.config_data),
        "current_version": db_item.current_version
    }


# ─── 获取 ────────────────────────────────────────────
@router.get("/{plugin_name}")
async def get_plugin_metadata(cluster_id: int, plugin_name: str, db: AsyncSession = Depends(get_db)):
    item = await edge_sync.get_or_404(db, PluginMetadata, cluster_id=cluster_id, plugin_name=plugin_name, detail="插件配置不存在")
    return {
        "id": item.id,
        "cluster_id": item.cluster_id,
        "plugin_name": item.plugin_name,
        "metadata": json.loads(item.config_data) if item.config_data else {},
        "current_version": item.current_version,
        "created_at": item.created_at.isoformat() + 'Z' if item.created_at else None,
        "updated_at": item.updated_at.isoformat() + 'Z' if item.updated_at else None
    }


# ─── 更新 ────────────────────────────────────────────
@router.put("/{plugin_name}")
async def update_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    metadata: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    item = await edge_sync.get_or_404(db, PluginMetadata, cluster_id=cluster_id, plugin_name=plugin_name, detail="插件配置不存在")

    item.config_data = json.dumps(metadata)
    await db.commit()
    await db.refresh(item)

    return {
        "id": item.id,
        "cluster_id": item.cluster_id,
        "plugin_name": item.plugin_name,
        "metadata": metadata,
        "current_version": item.current_version
    }


# ─── 删除（级联 ConfigVersion） ─────────────────────
@router.delete("/{plugin_name}")
async def delete_plugin_metadata(cluster_id: int, plugin_name: str, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db)):

    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    item = await edge_sync.get_or_404(db, PluginMetadata, cluster_id=cluster_id, plugin_name=plugin_name, detail="插件配置不存在")

    node_query = select(Node).where(Node.cluster_id == cluster_id, Node.status == 1)
    if body.node_ids:
        node_query = node_query.where(Node.id.in_(body.node_ids))
    nodes_result = await db.execute(node_query)
    active_nodes = nodes_result.scalars().all()

    results = []

    if body.delete_db:
        await db.execute(
            ConfigVersion.__table__.delete().where(
                ConfigVersion.resource_type == "plugin_metadata",
                ConfigVersion.resource_id == item.id
            )
        )
        await db.delete(item)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        edge_results = await edge_sync.delete_on_nodes(
            cluster_id, active_nodes, plugin_name,
            lambda client, name: client.delete_plugin_metadata(name)
        )
        results.extend(edge_results)

    return {"message": "插件配置已删除", "results": results}


# ─── 发布 ────────────────────────────────────────────
@router.post("/{plugin_name}/publish")
async def publish_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    req: Optional[PublishRequest] = None,
    db: AsyncSession = Depends(get_db)
):

    item = await edge_sync.get_or_404(db, PluginMetadata, cluster_id=cluster_id, plugin_name=plugin_name, detail="插件配置不存在")

    plugin_config = json.loads(item.config_data) if item.config_data else {}
    config_data = {"plugin_name": item.plugin_name, "config_data": plugin_config}
    new_version = await edge_sync.create_config_version(db, "plugin_metadata", item.id, cluster_id, config_data, item)

    edge_data = plugin_config

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()
    active_nodes = await edge_sync.get_active_nodes(cluster_id, db, req.node_ids if req else None)
    if not active_nodes:
        return {"status": "error", "message": "集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    edge_logger = get_edge_logger()

    results, success_count, fail_count = await edge_sync.publish_to_nodes(
        cluster_id, active_nodes, edge_data,
        publish_fn=lambda client: client.create_plugin_metadata(plugin_name, edge_data),
        log_fn=lambda node_result, response, error, encrypted: edge_logger.log_publish_result(
            resource_type="plugin_metadata",
            cluster_id=cluster_id,
            cluster_name=cluster.name if cluster else str(cluster_id),
            resource_id=None,
            resource_name=plugin_name,
            method="PUT",
            path=f"/edge/admin/plugin_metadata/{plugin_name}",
            request_body=edge_data,
            encrypted_body=encrypted,
            response_status=201,
            response_body=response,
            error=error,
        ),
        post_publish_fn=lambda client: client.reload_plugins(),
        post_log_fn=lambda node_result, response, error, encrypted: edge_logger.log_publish_result(
            resource_type="plugin_metadata",
            cluster_id=cluster_id,
            cluster_name=cluster.name if cluster else str(cluster_id),
            resource_id=None,
            resource_name=plugin_name,
            method="PUT",
            path="/edge/admin/plugins/reload",
            request_body={},
            encrypted_body=encrypted,
            response_status=200,
            response_body=response,
            error=error,
        ),
    )

    return edge_sync.build_publish_response(results, success_count, fail_count, len(active_nodes), "插件元数据", new_version)


# ─── 版本历史 ──────────────────────────────────────
@router.get("/{plugin_name}/versions")
async def get_plugin_metadata_versions(
    cluster_id: int,
    plugin_name: str,
    db: AsyncSession = Depends(get_db)
):
    item = await edge_sync.get_or_404(db, PluginMetadata, cluster_id=cluster_id, plugin_name=plugin_name, detail="插件配置不存在")

    versions_result = await db.execute(
        select(ConfigVersion).where(
            ConfigVersion.resource_type == "plugin_metadata",
            ConfigVersion.resource_id == item.id
        ).order_by(ConfigVersion.version.desc())
    )
    versions = versions_result.scalars().all()

    return {
        "total": len(versions),
        "items": [{
            "id": v.id,
            "version": v.version,
            "config": json.loads(v.config) if v.config else {},
            "created_at": v.created_at.isoformat() + 'Z' if v.created_at else None
        } for v in versions],
        "current_version": item.current_version
    }


# ─── 回滚 ──────────────────────────────────────────
@router.post("/{plugin_name}/rollback/{version}")
async def rollback_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    version: int,
    db: AsyncSession = Depends(get_db)
):
    item = await edge_sync.get_or_404(db, PluginMetadata, cluster_id=cluster_id, plugin_name=plugin_name, detail="插件配置不存在")

    cv_result = await db.execute(
        select(ConfigVersion).where(
            ConfigVersion.resource_type == "plugin_metadata",
            ConfigVersion.resource_id == item.id,
            ConfigVersion.version == version
        )
    )
    cv = cv_result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="指定版本不存在")

    item.config_data = cv.config
    item.current_version = version
    await db.commit()

    return {"message": f"插件 {plugin_name} 已回滚到版本 v{version}", "version": version}


# ─── 删历史版本 ─────────────────────────────────────
@router.delete("/{plugin_name}/versions/{version_id}")
async def delete_plugin_metadata_version(
    cluster_id: int,
    plugin_name: str,
    version_id: int,
    db: AsyncSession = Depends(get_db)
):
    item = await edge_sync.get_or_404(db, PluginMetadata, cluster_id=cluster_id, plugin_name=plugin_name, detail="插件配置不存在")

    cv_result = await db.execute(
        select(ConfigVersion).where(
            ConfigVersion.id == version_id,
            ConfigVersion.resource_type == "plugin_metadata",
            ConfigVersion.resource_id == item.id
        )
    )
    cv = cv_result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本不存在")
    if item.current_version == cv.version:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无法删除当前版本")

    await db.delete(cv)
    await db.commit()
    return {"message": "版本已删除"}
