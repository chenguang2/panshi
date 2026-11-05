"""集群配置漂移检测端点（openspec: config-drift-detection）。

只读：GET /clusters/{cluster_id}/drift——基线（发布快照实发载荷）vs Edge
运行态字段级对比，三态结论。不写库、不改 Edge；GET 无审计骨架（无审计负担）。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.cluster import Cluster
from app.services.drift_detection import detect_cluster_drift

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/clusters/{cluster_id}/drift")
async def get_cluster_drift(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    cluster = (
        await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    ).scalar_one_or_none()
    if cluster is None:
        raise HTTPException(status_code=404, detail="集群不存在")
    return await detect_cluster_drift(db, cluster_id)
