"""发布差异预览端点（openspec: publish-diff-preview）。

只读：GET /clusters/{cluster_id}/publish-preview/{resource_type}/{resource_id}——
待发布候选载荷 vs 各活跃节点实况的逐节点字段级对比。不写库、不改 Edge；
GET 无审计骨架（无审计负担），router 级鉴权同 cluster_drift 先例。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.cluster import Cluster
from app.services.publish_preview import PUBLISH_PREVIEW_REGISTRY, preview_publish_diff

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/clusters/{cluster_id}/publish-preview/{resource_type}/{resource_id}")
async def get_publish_preview(
    cluster_id: int,
    resource_type: str,
    resource_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if resource_type not in PUBLISH_PREVIEW_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"资源类型 {resource_type} 尚未接入发布差异预览（首批：上游、路由）",
        )
    cluster = (
        await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    ).scalar_one_or_none()
    if cluster is None:
        raise HTTPException(status_code=404, detail="集群不存在")
    return await preview_publish_diff(
        db, cluster_id=cluster_id, resource_type=resource_type, resource_id=resource_id
    )
