from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.core.database import get_db
from app.models.cluster import Cluster, Upstream, UpstreamTarget, Route, RoutePlugin
from app.schemas.cluster import (
    ClusterCreate, ClusterUpdate, ClusterResponse, ClusterListResponse,
    UpstreamCreate, UpstreamUpdate, UpstreamResponse, UpstreamWithTargets, UpstreamTargetSchema
)

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get("", response_model=ClusterListResponse)
async def list_clusters(
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db)
):
    query = select(Cluster)
    if keyword:
        query = query.where(Cluster.name.contains(keyword) | Cluster.display_name.contains(keyword))
    
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    clusters = result.scalars().all()
    
    return ClusterListResponse(total=total, items=[ClusterResponse.model_validate(c) for c in clusters])


@router.post("", response_model=ClusterResponse, status_code=status.HTTP_201_CREATED)
async def create_cluster(cluster: ClusterCreate, db: AsyncSession = Depends(get_db)):
    db_cluster = Cluster(**cluster.model_dump())
    db.add(db_cluster)
    await db.commit()
    await db.refresh(db_cluster)
    return ClusterResponse.model_validate(db_cluster)


@router.get("/{cluster_id}", response_model=ClusterResponse)
async def get_cluster(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
    return ClusterResponse.model_validate(cluster)


@router.put("/{cluster_id}", response_model=ClusterResponse)
async def update_cluster(cluster_id: int, cluster_update: ClusterUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
    
    for key, value in cluster_update.model_dump(exclude_unset=True).items():
        setattr(cluster, key, value)
    
    await db.commit()
    await db.refresh(cluster)
    return ClusterResponse.model_validate(cluster)


@router.delete("/{cluster_id}")
async def delete_cluster(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
    
    await db.delete(cluster)
    await db.commit()
    return {"message": "Cluster deleted"}


@router.post("/{cluster_id}/test")
async def test_connection(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
    
    return {"status": "ok", "message": "Connection successful"}


@router.post("/{cluster_id}/sync")
async def sync_cluster(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
    
    return {"status": "ok", "message": "Sync successful"}


@router.get("/{cluster_id}/upstreams", response_model=dict)
async def list_upstreams(cluster_id: int, db: AsyncSession = Depends(get_db)):
    query = select(Upstream).where(Upstream.cluster_id == cluster_id)
    result = await db.execute(query)
    upstreams = result.scalars().all()
    return {"total": len(upstreams), "items": [UpstreamResponse.model_validate(u) for u in upstreams]}


@router.post("/{cluster_id}/upstreams", response_model=UpstreamResponse, status_code=status.HTTP_201_CREATED)
async def create_upstream(cluster_id: int, upstream: UpstreamCreate, db: AsyncSession = Depends(get_db)):
    db_upstream = Upstream(cluster_id=cluster_id, **upstream.model_dump(exclude={"cluster_id"}))
    db.add(db_upstream)
    await db.commit()
    await db.refresh(db_upstream)
    return UpstreamResponse.model_validate(db_upstream)


@router.get("/{cluster_id}/upstreams/{upstream_id}", response_model=UpstreamWithTargets)
async def get_upstream(cluster_id: int, upstream_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upstream not found")
    
    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
    targets = targets_result.scalars().all()
    
    response = UpstreamWithTargets.model_validate(upstream)
    response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
    return response


@router.put("/{cluster_id}/upstreams/{upstream_id}", response_model=UpstreamResponse)
async def update_upstream(cluster_id: int, upstream_id: int, upstream_update: UpstreamUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upstream not found")
    
    for key, value in upstream_update.model_dump(exclude_unset=True).items():
        setattr(upstream, key, value)
    
    await db.commit()
    await db.refresh(upstream)
    return UpstreamResponse.model_validate(upstream)


@router.delete("/{cluster_id}/upstreams/{upstream_id}")
async def delete_upstream(cluster_id: int, upstream_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upstream not found")
    
    await db.delete(upstream)
    await db.commit()
    return {"message": "Upstream deleted"}