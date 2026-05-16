import json
import os
import shutil
import tempfile
import uuid
import zipfile
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.cluster import Cluster, Node, ConfigVersion
from app.models.static_resource import StaticResource
from app.schemas.static_resource import (
    StaticResourceCreate,
    StaticResourceUpdate,
    StaticResourceResponse,
    StaticResourceListResponse,
)
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError

router = APIRouter(prefix="/clusters/{cluster_id}/static-resources", tags=["static-resources"])

ALLOWED_SORT_FIELDS = {"name", "url_path", "file_size", "created_at"}
ALLOWED_SEARCH_FIELDS = {"name", "url_path", "description"}


def resource_to_response(r: StaticResource) -> StaticResourceResponse:
    return StaticResourceResponse(
        id=r.id,
        cluster_id=r.cluster_id,
        name=r.name,
        url_path=r.url_path,
        description=r.description,
        file_size=r.file_size,
        current_version=r.current_version,
        created_at=r.created_at.isoformat() + "Z" if r.created_at else None,
        updated_at=r.updated_at.isoformat() + "Z" if r.updated_at else None,
    )


@router.get("", response_model=StaticResourceListResponse)
async def list_static_resources(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("asc", pattern="^(asc|desc)$"),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
):
    query = select(StaticResource).where(StaticResource.cluster_id == cluster_id)

    if search:
        pattern = f"%{search}%"
        if search_field and search_field in ALLOWED_SEARCH_FIELDS:
            col = getattr(StaticResource, search_field)
            query = query.where(col.ilike(pattern))
        else:
            from sqlalchemy import or_
            conditions = [
                getattr(StaticResource, f).ilike(pattern)
                for f in ALLOWED_SEARCH_FIELDS
            ]
            query = query.where(or_(*conditions))

    if sort_by and sort_by in ALLOWED_SORT_FIELDS:
        col = getattr(StaticResource, sort_by)
        if sort_order == "desc":
            col = col.desc()
        query = query.order_by(col)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    result = await db.execute(query)
    resources = result.scalars().all()

    return StaticResourceListResponse(
        total=total,
        items=[resource_to_response(r) for r in resources],
    )


@router.post("", response_model=StaticResourceResponse, status_code=status.HTTP_201_CREATED)
async def create_static_resource(
    cluster_id: int,
    body: StaticResourceCreate,
    db: AsyncSession = Depends(get_db),
):
    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    existing = await db.execute(
        select(StaticResource).where(
            StaticResource.cluster_id == cluster_id,
            StaticResource.name == body.name,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"静态资源 '{body.name}' 已存在")

    resource = StaticResource(
        cluster_id=cluster_id,
        name=body.name,
        url_path=body.url_path,
        description=body.description,
    )
    db.add(resource)
    await db.commit()
    await db.refresh(resource)
    return resource_to_response(resource)


@router.get("/{resource_id}", response_model=StaticResourceResponse)
async def get_static_resource(
    cluster_id: int,
    resource_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StaticResource).where(
            StaticResource.id == resource_id,
            StaticResource.cluster_id == cluster_id,
        )
    )
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="静态资源不存在")
    return resource_to_response(resource)


@router.put("/{resource_id}", response_model=StaticResourceResponse)
async def update_static_resource(
    cluster_id: int,
    resource_id: int,
    body: StaticResourceUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StaticResource).where(
            StaticResource.id == resource_id,
            StaticResource.cluster_id == cluster_id,
        )
    )
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="静态资源不存在")

    if body.name is not None:
        existing = await db.execute(
            select(StaticResource).where(
                StaticResource.cluster_id == cluster_id,
                StaticResource.name == body.name,
                StaticResource.id != resource_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail=f"静态资源 '{body.name}' 已存在")
        resource.name = body.name
    if body.url_path is not None:
        resource.url_path = body.url_path
    if body.description is not None:
        resource.description = body.description

    await db.commit()
    await db.refresh(resource)
    return resource_to_response(resource)


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_static_resource(
    cluster_id: int,
    resource_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StaticResource).where(
            StaticResource.id == resource_id,
            StaticResource.cluster_id == cluster_id,
        )
    )
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="静态资源不存在")

    await db.delete(resource)
    await db.commit()


@router.post("/{resource_id}/upload", response_model=StaticResourceResponse)
async def upload_static_resource_zip(
    cluster_id: int,
    resource_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StaticResource).where(
            StaticResource.id == resource_id,
            StaticResource.cluster_id == cluster_id,
        )
    )
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="静态资源不存在")

    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="仅支持 zip 格式文件")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="文件内容为空")

    import io
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise HTTPException(status_code=400, detail="无效的 zip 文件")

    storage_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "static_resources")
    os.makedirs(storage_dir, exist_ok=True)
    storage_path = os.path.join(storage_dir, f"{resource.name}_{uuid.uuid4().hex}.zip")

    with open(storage_path, "wb") as f:
        f.write(content)

    if resource.storage_path and os.path.exists(resource.storage_path):
        os.remove(resource.storage_path)

    resource.storage_path = storage_path
    resource.file_size = len(content)
    await db.commit()
    await db.refresh(resource)
    return resource_to_response(resource)


def _get_sync_session():
    from sqlalchemy.orm import Session
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool
    from app.core.database import DATABASE_URL, is_sqlite

    sync_url = DATABASE_URL.replace("sqlite+aiosqlite://", "sqlite://").replace("postgresql+asyncpg://", "postgresql://")
    if is_sqlite(DATABASE_URL):
        engine = create_engine(sync_url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    else:
        engine = create_engine(sync_url)
    return Session(engine)


@router.post("/{resource_id}/publish")
async def publish_static_resource(
    cluster_id: int,
    resource_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StaticResource).where(
            StaticResource.id == resource_id,
            StaticResource.cluster_id == cluster_id,
        )
    )
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="静态资源不存在")

    if not resource.storage_path or not os.path.exists(resource.storage_path):
        raise HTTPException(status_code=400, detail="请先上传 zip 文件")

    nodes_result = await db.execute(
        select(Node).where(
            Node.cluster_id == cluster_id,
            Node.status == 1,
        )
    )
    nodes = nodes_result.scalars().all()
    if not nodes:
        raise HTTPException(status_code=400, detail="没有活跃的 Edge 节点")

    with open(resource.storage_path, "rb") as f:
        zip_data = f.read()

    sync_db = _get_sync_session()
    results = []
    all_success = True

    try:
        for node in nodes:
            try:
                client = EdgeClient(
                    cluster_id=cluster_id,
                    db=sync_db,
                    node_ip=node.ip,
                    node_port=node.management_port,
                )
                cluster_row = sync_db.execute(
                    select(Cluster.admin_key).where(Cluster.id == cluster_id)
                ).first()
                admin_key = cluster_row[0] if cluster_row and cluster_row[0] else None
                if not admin_key:
                    admin_key = os.getenv("EDGE_ADMIN_KEY", "f9357106bff442f89d4de7169c37c61e")
                client.api_key = admin_key

                client._request("PUT", f"/edge/admin/static_resources/{resource.name}", zip_data)

                edge_route = {
                    "uri": resource.url_path.rstrip("/") + "/*",
                    "name": f"static-{resource.name}",
                    "plugins": {
                        "static_resource": {
                            "base_path": "/data/edge/static",
                            "cache_max_age": 3600,
                        }
                    },
                    "status": 1,
                }
                client.create_route(edge_route)
                results.append({"node": f"{node.ip}:{node.management_port}", "status": "success"})
            except (EdgeConnectionError, EdgeAPIError) as e:
                results.append({"node": f"{node.ip}:{node.management_port}", "status": "failed", "error": str(e)})
                all_success = False

        if resource.current_version is None:
            resource.current_version = 1
        else:
            resource.current_version += 1

        db.add(ConfigVersion(
            cluster_id=cluster_id,
            resource_type="static_resource",
            resource_id=resource.id,
            version=resource.current_version,
            config=json.dumps({
                "name": resource.name,
                "url_path": resource.url_path,
                "file_size": resource.file_size,
            }, ensure_ascii=False),
            created_by="system",
        ))
        await db.commit()
        await db.refresh(resource)

    finally:
        sync_db.close()

    return {
        "success": all_success,
        "current_version": resource.current_version,
        "results": results,
    }
