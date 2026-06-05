from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.cluster import Node, Cluster
from app.schemas.cluster import NodeResponse

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.get("", response_model=dict)
async def find_node(
    ip: str,
    management_port: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Node).where(Node.ip == ip, Node.management_port == management_port).limit(1)
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")

    cluster_result = await db.execute(
        select(Cluster.name, Cluster.display_name).where(Cluster.id == node.cluster_id)
    )
    cluster = cluster_result.first()

    return {
        "id": node.id,
        "cluster_id": node.cluster_id,
        "cluster_name": cluster.display_name if cluster else "",
        "ip": node.ip,
        "service_port": node.service_port,
        "management_port": node.management_port,
        "edge_path": node.edge_path,
        "status": node.status,
    }
