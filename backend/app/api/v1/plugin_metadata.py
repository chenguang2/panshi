from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import json

from app.core.database import get_db
from app.config import MAX_PAGE_SIZE
from app.models.cluster import PluginMetadata, Cluster
from app.models.user import User, UserCluster
from app.services import batch_delete, edge_sync
from app.core.deps import require_permission
from app.schemas.publish_detail import parse_publish_detail
from app.schemas.cluster import BatchDeletePluginMetadataRequest

router = APIRouter(prefix="/plugin_metadata", tags=["plugin_metadata"])


@router.get("", response_model=dict)
async def list_all_plugin_metadata(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    group_name: str = Query("__all__"),
    search: Optional[str] = Query(None),
    cluster_id: Optional[int] = Query(None),
    plugin_name: Optional[str] = Query(None, description="按插件名精确筛选（工具条「全部插件」下拉）"),
    current_user: User = Depends(require_permission('plugin_metadata')),
):
    query = select(PluginMetadata)

    if cluster_id is not None:
        query = query.where(PluginMetadata.cluster_id == cluster_id)

    if group_name == "__ung__":
        query = query.join(Cluster, PluginMetadata.cluster_id == Cluster.id).where(
            Cluster.group_name.is_(None) | (Cluster.group_name == "")
        )
    elif group_name != "__all__":
        query = query.join(Cluster, PluginMetadata.cluster_id == Cluster.id).where(
            Cluster.group_name == group_name
        )

    if current_user.role != "admin":
        uc_result = await db.execute(
            select(UserCluster.cluster_id).where(UserCluster.user_id == current_user.id)
        )
        allowed_ids = [r[0] for r in uc_result.all()]
        if not allowed_ids:
            return {"total": 0, "page": page, "page_size": page_size, "items": []}
        query = query.where(PluginMetadata.cluster_id.in_(allowed_ids))

    if plugin_name:
        # 精确匹配（下拉选项来自插件目录，不需要模糊）：与 search 可叠加
        query = query.where(PluginMetadata.plugin_name == plugin_name)

    if search:
        pattern = f"%{search}%"
        query = query.where(PluginMetadata.plugin_name.ilike(pattern))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(PluginMetadata.id)

    result = await db.execute(query)
    items = result.scalars().all()

    cluster_ids = {r.cluster_id for r in items}
    cluster_name_map = {}
    cluster_group_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name, Cluster.name, Cluster.group_name).where(Cluster.id.in_(cluster_ids))
        )
        for row in c_result.all():
            cluster_name_map[row[0]] = row[1] or row[2]
            cluster_group_map[row[0]] = row[3] or ""

    # 批量回查最新发布时间 + pending 推导（published_at 回查与 pending 推导收敛在
    # edge_sync 共享单点，与集群子页端点同口径，禁止各自实现；publish-map 按
    # resource_id 主键聚合，无跨集群碰撞——键位口径对照 plugin_configs 全局端点先例）
    pub_map = await edge_sync.load_publish_time_map(db, "plugin_metadata", [r.id for r in items])

    resp_items = []
    for r in items:
        ts = pub_map.get(r.id)
        resp_items.append({
            "id": r.id,
            "cluster_id": r.cluster_id,
            "cluster_name": cluster_name_map.get(r.cluster_id, ""),
            "cluster_group_name": cluster_group_map.get(r.cluster_id, ""),
            "plugin_name": r.plugin_name,
            "config_data": json.loads(r.config_data) if r.config_data else {},
            "current_version": r.current_version,
            "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
            "updated_at": r.updated_at.isoformat() + "Z" if r.updated_at else None,
            "published_at": ts.isoformat() + "Z" if ts else None,
            "pending_publish": edge_sync.derive_pending_publish(
                current_version=r.current_version,
                updated_at=r.updated_at,
                published_at=ts,
                last_publish_status=r.last_publish_status,
            ),
            "last_publish_status": r.last_publish_status,
            # republish-failed-nodes 方案 B：逐节点失败明细（解析对象）
            "last_publish_detail": parse_publish_detail(r.last_publish_detail),
        })

    return {"total": total, "page": page, "page_size": page_size, "items": resp_items}


@router.delete("", response_model=dict)
async def delete_plugin_metadata_global(
    body: BatchDeletePluginMetadataRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("plugin_metadata")),
):
    """批量删除插件元数据（跨集群，全局视图）——契约统一入口（U2）。

    唯一实现在 `services/batch_delete.py`；Edge 侧按 plugin_name 定位（非 edge_uuid）。
    """
    return await batch_delete.batch_delete(
        "plugin_metadata",
        list(body.metadata_ids),
        db=db,
        delete_db=body.delete_db,
        delete_edge=body.delete_edge,
        node_ids=body.node_ids,
        user=current_user,
    )
