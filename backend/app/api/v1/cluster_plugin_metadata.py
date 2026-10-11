from fastapi import APIRouter, Body, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, Dict, Any
import json

from app.core.database import get_db
from app.models.cluster import PluginMetadata, ConfigVersion, Node
from app.schemas.cluster import DeleteClusterRequest, PublishRequest
from app.services import edge_sync
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError

from app.core.deps import require_permission

router = APIRouter(prefix="/clusters/{cluster_id}/plugin-metadata", tags=["plugin-metadata"], dependencies=[Depends(require_permission('clusters'))])


# ─── 列表 ────────────────────────────────────────────
@router.get("")
async def list_plugin_metadata(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PluginMetadata).where(PluginMetadata.cluster_id == cluster_id).order_by(PluginMetadata.id)
    )
    items = result.scalars().all()
    # 批量回查最新发布时间 + pending 推导（published_at 回查与 pending 推导收敛在
    # edge_sync 共享单点，与跨集群 /plugin_metadata 端点同口径，禁止各自实现）
    pub_map = await edge_sync.load_publish_time_map(db, "plugin_metadata", [i.id for i in items])
    resp_items = []
    for item in items:
        ts = pub_map.get(item.id)
        resp_items.append({
            "id": item.id,
            "cluster_id": item.cluster_id,
            "plugin_name": item.plugin_name,
            "metadata": json.loads(item.config_data) if item.config_data else {},
            "current_version": item.current_version,
            "created_at": item.created_at.isoformat() + 'Z' if item.created_at else None,
            "updated_at": item.updated_at.isoformat() + 'Z' if item.updated_at else None,
            "published_at": ts.isoformat() + 'Z' if ts else None,
            "pending_publish": edge_sync.derive_pending_publish(
                current_version=item.current_version,
                updated_at=item.updated_at,
                published_at=ts,
                last_publish_status=item.last_publish_status,
            ),
            "last_publish_status": item.last_publish_status,
        })
    return {"total": len(items), "items": resp_items}


# ─── 创建 ────────────────────────────────────────────
@router.post("")
async def create_plugin_metadata(
    cluster_id: int,
    plugin_name: str,
    config_data: Optional[Dict[str, Any]] = None,
    db: AsyncSession = Depends(get_db),
    request: Request = None,
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
    await db.flush()  # 审计增强前先拿 id
    audit = getattr(request.state, "audit", None)
    if audit is not None:
        audit.resource_id = db_item.id
        audit.detail = f"创建插件元数据 {db_item.plugin_name}"
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
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    item = await edge_sync.get_or_404(db, PluginMetadata, cluster_id=cluster_id, plugin_name=plugin_name, detail="插件配置不存在")

    item.config_data = json.dumps(metadata)
    audit = getattr(request.state, "audit", None)
    if audit is not None:
        audit.detail = f"更新插件元数据 {item.plugin_name}"
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
async def delete_plugin_metadata(cluster_id: int, plugin_name: str, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db), request: Request = None):

    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    item = await edge_sync.get_or_404(db, PluginMetadata, cluster_id=cluster_id, plugin_name=plugin_name, detail="插件配置不存在")
    audit = getattr(request.state, "audit", None)
    if audit is not None:
        audit.detail = f"删除插件元数据 {item.plugin_name}"

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
    edge_data = plugin_config

    return await edge_sync.publish_resource(
        db, cluster_id=cluster_id, resource=item, resource_type="plugin_metadata",
        config_data=config_data, edge_data=edge_data,
        publish_fn=lambda client: client.create_plugin_metadata(plugin_name, edge_data),
        display_name="插件元数据",
        log_path=f"/edge/admin/plugin_metadata/{plugin_name}",
        log_resource_id=None, log_resource_name=plugin_name,
        node_ids=req.node_ids if req else None,
        post_publish_fn=lambda client: client.reload_plugins(),
    )


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

    async def _restore(_db, meta, cfg):
        # 版本快照 config 是发布载荷 {"plugin_name", "config_data"} 包装，恢复取
        # 内层 config_data（用与创建/更新端点一致的 json.dumps 默认序列化，保证
        # 「回滚到当前版本」时 config_data 同文不产生脏属性 → no-op 语义成立）。
        # partial 清除由 rollback_resource 共享单点能力探测完成（不在此特判）。
        inner = cfg.get("config_data") if isinstance(cfg, dict) else None
        meta.config_data = json.dumps(inner if inner is not None else cfg)

    await edge_sync.rollback_resource(
        db, PluginMetadata, resource_type="plugin_metadata", resource_id=item.id, version=version,
        not_found_detail="插件配置不存在", cluster_id=cluster_id, restore_fn=_restore)
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

    # 守卫：无法删除当前版本（共享 delete_config_version 只管存在性 404 + 删除，
    # 资源级守卫在调用方保留既有语义：400 无法删除当前版本 / 404 版本不存在）
    if item.current_version is not None:
        is_current = (
            await db.execute(
                select(ConfigVersion.id).where(
                    ConfigVersion.id == version_id,
                    ConfigVersion.version == item.current_version,
                    ConfigVersion.resource_type == "plugin_metadata",
                    ConfigVersion.resource_id == item.id,
                )
            )
        ).scalar_one_or_none()
        if is_current is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无法删除当前版本")

    await edge_sync.delete_config_version(
        db, resource_type="plugin_metadata", resource_id=item.id,
        history_id=version_id, detail="版本不存在")
    return {"message": "版本已删除"}
