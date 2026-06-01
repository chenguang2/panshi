from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, Dict, Any
import json

from app.core.database import get_db
from app.models.cluster import PluginMetadata, ConfigVersion, Node, Cluster
from app.schemas.cluster import DeleteClusterRequest, PublishRequest

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
    result = await db.execute(
        select(PluginMetadata).where(
            PluginMetadata.cluster_id == cluster_id,
            PluginMetadata.plugin_name == plugin_name
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")
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
    result = await db.execute(
        select(PluginMetadata).where(
            PluginMetadata.cluster_id == cluster_id,
            PluginMetadata.plugin_name == plugin_name
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

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
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError

    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(
        select(PluginMetadata).where(
            PluginMetadata.cluster_id == cluster_id,
            PluginMetadata.plugin_name == plugin_name
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

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
        if active_nodes:
            for node in active_nodes:
                node_result = {"node": f"{node.ip}:{node.management_port}", "scope": "edge", "status": "pending"}
                try:
                    client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)
                    response = client.delete_plugin_metadata(plugin_name)
                    node_result["status"] = "success"
                    node_result["response"] = response
                except (EdgeConnectionError, EdgeAPIError) as e:
                    node_result["status"] = "failed"
                    node_result["error"] = str(e)
                results.append(node_result)
        else:
            results.append({"scope": "edge", "status": "skipped", "message": "集群中没有活跃的 Edge 节点"})

    return {"message": "插件配置已删除", "results": results}


# ─── 发布 ────────────────────────────────────────────
@router.post("/{plugin_name}/publish")
async def publish_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    req: Optional[PublishRequest] = None,
    db: AsyncSession = Depends(get_db)
):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
    from app.services.edge_logger import get_edge_logger

    result = await db.execute(
        select(PluginMetadata).where(
            PluginMetadata.cluster_id == cluster_id,
            PluginMetadata.plugin_name == plugin_name
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

    plugin_config = json.loads(item.config_data) if item.config_data else {}

    # 版本递增 + ConfigVersion
    version_result = await db.execute(
        select(func.max(ConfigVersion.version)).where(
            ConfigVersion.resource_type == "plugin_metadata",
            ConfigVersion.resource_id == item.id
        )
    )
    latest_version = version_result.scalar() or 0
    new_version = latest_version + 1

    cv = ConfigVersion(
        cluster_id=cluster_id,
        resource_type="plugin_metadata",
        resource_id=item.id,
        version=new_version,
        config=item.config_data
    )
    db.add(cv)
    item.current_version = new_version
    await db.commit()

    edge_data = plugin_config

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()

    if req and req.node_ids:
        nodes_result = await db.execute(select(Node).where(Node.id.in_(req.node_ids), Node.cluster_id == cluster_id))
    else:
        nodes_result = await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
    active_nodes = nodes_result.scalars().all()

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

            import base64
            import json as json_module
            encrypted = client._encrypt(json_module.dumps(edge_data).encode())
            response = client.create_plugin_metadata(plugin_name, edge_data)

            edge_logger.log_plugin_metadata_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                plugin_name=plugin_name,
                method="PUT",
                path=f"/edge/admin/plugin_metadata/{plugin_name}",
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
            edge_logger.log_plugin_metadata_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                plugin_name=plugin_name,
                method="PUT",
                path=f"/edge/admin/plugin_metadata/{plugin_name}",
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

    if success_count == len(active_nodes):
        return {"status": "ok", "message": f"插件元数据发布成功，已同步到 {success_count} 个节点", "version": new_version, "results": results}
    elif success_count > 0:
        return {"status": "partial", "message": f"插件元数据发布完成，{success_count}/{len(active_nodes)} 节点同步成功", "version": new_version, "results": results}
    else:
        return {"status": "error", "message": "插件元数据发布失败：无法连接到任何 edge 服务器", "version": new_version, "results": results}


# ─── 版本历史 ──────────────────────────────────────
@router.get("/{plugin_name}/versions")
async def get_plugin_metadata_versions(
    cluster_id: int,
    plugin_name: str,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PluginMetadata).where(
            PluginMetadata.cluster_id == cluster_id,
            PluginMetadata.plugin_name == plugin_name
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

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
    result = await db.execute(
        select(PluginMetadata).where(
            PluginMetadata.cluster_id == cluster_id,
            PluginMetadata.plugin_name == plugin_name
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

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
    result = await db.execute(
        select(PluginMetadata).where(
            PluginMetadata.cluster_id == cluster_id,
            PluginMetadata.plugin_name == plugin_name
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件配置不存在")

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
