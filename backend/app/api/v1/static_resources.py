import json
import os
import shutil
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.cluster import Cluster, Node, ConfigVersion, Route, RoutePlugin
from app.models.static_resource import StaticResource
from app.schemas.static_resource import (
    StaticResourceCreate,
    StaticResourceUpdate,
    StaticResourceResponse,
    StaticResourceListResponse,
)
from app.schemas.cluster import DeleteClusterRequest, PublishRequest
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError

router = APIRouter(prefix="/clusters/{cluster_id}/static-resources", tags=["static-resources"])

ALLOWED_SORT_FIELDS = {"name", "created_at"}
ALLOWED_SEARCH_FIELDS = {"name", "description"}

BASE_STORAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "data", "static"
)


def _get_storage_path(edge_uuid: str, version: int) -> str:
    """Generate storage path: {BASE}/static/{edge_uuid}/{version}.zip"""
    return os.path.join(BASE_STORAGE_DIR, edge_uuid, f"{version}.zip")


def resource_to_response(r: StaticResource) -> StaticResourceResponse:
    return StaticResourceResponse(
        id=r.id,
        cluster_id=r.cluster_id,
        route_id=r.route_id,
        edge_uuid=r.edge_uuid,
        name=r.name,
        url_path=r.url_path,
        description=r.description,
        file_size=r.file_size,
        storage_path=r.storage_path,
        current_version=r.current_version,
        created_at=r.created_at.isoformat() + "Z" if r.created_at else None,
        updated_at=r.updated_at.isoformat() + "Z" if r.updated_at else None,
    )


async def _get_route_with_plugins(db: AsyncSession, cluster_id: int, route_id: int):
    """Get a route and verify it has static_resource plugin and URI ends with *."""
    route_result = await db.execute(
        select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id)
    )
    route = route_result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="路由不存在")

    uri = (route.uri or "").strip()
    if not uri.endswith("/*"):
        raise HTTPException(status_code=400, detail="路由路径必须以 /* 结尾")

    if route.current_version is None:
        raise HTTPException(status_code=400, detail="路由必须先发布到 Edge 节点")

    plugin_result = await db.execute(
        select(RoutePlugin).where(
            RoutePlugin.route_id == route_id,
            RoutePlugin.plugin_name == "static_resource",
        )
    )
    if not plugin_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="静态资源路由必须加载 static_resource 插件")

    return route


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
    if not cluster_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="集群不存在")

    route = await _get_route_with_plugins(db, cluster_id, body.route_id)

    existing = await db.execute(
        select(StaticResource).where(
            StaticResource.cluster_id == cluster_id,
            StaticResource.route_id == body.route_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="该路由已关联静态资源")

    resource = StaticResource(
        cluster_id=cluster_id,
        route_id=body.route_id,
        edge_uuid=route.edge_uuid,
        name=route.name,
        url_path=route.uri,
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

    if body.description is not None:
        resource.description = body.description

    await db.commit()
    await db.refresh(resource)
    return resource_to_response(resource)


@router.delete("/{resource_id}")
async def delete_static_resource(
    cluster_id: int,
    resource_id: int,
    body: DeleteClusterRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(
        select(StaticResource).where(
            StaticResource.id == resource_id,
            StaticResource.cluster_id == cluster_id,
        )
    )
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="静态资源不存在")

    results = []

    if body.delete_db:
        if resource.storage_path and os.path.exists(resource.storage_path):
            os.remove(resource.storage_path)
        del_dir_name = resource.edge_uuid or str(resource.route_id)
        route_dir = os.path.join(BASE_STORAGE_DIR, del_dir_name)
        if os.path.exists(route_dir):
            shutil.rmtree(route_dir)
        await db.execute(
            ConfigVersion.__table__.delete().where(
                ConfigVersion.resource_type == "static_resource",
                ConfigVersion.resource_id == resource_id,
            )
        )
        await db.delete(resource)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除，本地文件已清理"})

    if body.delete_edge and resource.edge_uuid:
        sync_db = _get_sync_session()
        try:
            node_query = select(Node).where(Node.cluster_id == cluster_id, Node.status == 1)
            if body.node_ids:
                node_query = node_query.where(Node.id.in_(body.node_ids))
            nodes_result = await db.execute(node_query)
            nodes = nodes_result.scalars().all()
            edge_log_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "..", "logs", "edge", "static_resources.log")
            os.makedirs(os.path.dirname(edge_log_path), exist_ok=True)
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
                    delete_url = f"/edge/panshi/admin_static_resources?edge_uuid={resource.edge_uuid}"
                    with open(edge_log_path, "a", encoding="utf-8") as log_f:
                        log_f.write(f"[{datetime.now().isoformat()}] DELETE {node.ip}:{node.management_port} {delete_url}\n")
                    client.raw_delete(delete_url)
                    with open(edge_log_path, "a", encoding="utf-8") as log_f:
                        log_f.write(f"[{datetime.now().isoformat()}] DELETE {node.ip}:{node.management_port} success\n")
                    results.append({"node": f"{node.ip}:{node.management_port}", "scope": "edge", "status": "success", "message": "Edge 节点文件已删除"})
                except (EdgeConnectionError, EdgeAPIError) as e:
                    with open(edge_log_path, "a", encoding="utf-8") as log_f:
                        log_f.write(f"[{datetime.now().isoformat()}] DELETE {node.ip}:{node.management_port} failed: {e}\n")
                    results.append({"node": f"{node.ip}:{node.management_port}", "scope": "edge", "status": "failed", "error": str(e)})
                except (EdgeConnectionError, EdgeAPIError) as e:
                    results.append({"node": f"{node.ip}:{node.management_port}", "scope": "edge", "status": "failed", "error": str(e)})
        finally:
            sync_db.close()

    return {"message": "静态资源已删除", "results": results}


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
    import zipfile
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise HTTPException(status_code=400, detail="无效的 zip 文件")

    if resource.current_version is None:
        resource.current_version = 0
    next_version = resource.current_version + 1

    edge_uuid = resource.edge_uuid or str(resource.route_id)
    storage_path = _get_storage_path(edge_uuid, next_version)
    os.makedirs(os.path.dirname(storage_path), exist_ok=True)

    with open(storage_path, "wb") as f:
        f.write(content)

    resource.storage_path = storage_path
    resource.file_size = len(content)
    resource.current_version = next_version

    db.add(ConfigVersion(
        cluster_id=cluster_id,
        resource_type="static_resource",
        resource_id=resource.id,
        version=next_version,
        config=json.dumps({
            "file_size": len(content),
            "file_path": storage_path,
            "route_id": resource.route_id,
            "edge_uuid": resource.edge_uuid,
        }, ensure_ascii=False),
        created_by="system",
    ))
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
    req: Optional[PublishRequest] = None,
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

    if req and req.node_ids:
        nodes_result = await db.execute(
            select(Node).where(Node.id.in_(req.node_ids), Node.cluster_id == cluster_id)
        )
    else:
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

                edge_uuid = resource.edge_uuid or ""
                client.raw_put(f"/edge/panshi/admin_static_resources?edge_uuid={edge_uuid}", zip_data)

                results.append({"node": f"{node.ip}:{node.management_port}", "status": "success"})
            except (EdgeConnectionError, EdgeAPIError) as e:
                results.append({"node": f"{node.ip}:{node.management_port}", "status": "failed", "error": str(e)})
                all_success = False

    finally:
        sync_db.close()

    return {
        "success": all_success,
        "current_version": resource.current_version,
        "results": results,
    }


@router.get("/{resource_id}/history")
async def get_static_resource_history(
    cluster_id: int,
    resource_id: int,
    db: AsyncSession = Depends(get_db),
):
    from app.models.cluster import ConfigVersion
    from app.schemas.cluster import ConfigVersionResponse, ConfigVersionListResponse

    result = await db.execute(
        select(ConfigVersion).where(
            ConfigVersion.resource_type == "static_resource",
            ConfigVersion.resource_id == resource_id,
        ).order_by(ConfigVersion.version.desc())
    )
    versions = result.scalars().all()

    sr = await db.execute(
        select(StaticResource).where(StaticResource.id == resource_id, StaticResource.cluster_id == cluster_id)
    )
    resource = sr.scalar_one_or_none()

    return ConfigVersionListResponse(
        total=len(versions),
        items=[ConfigVersionResponse.model_validate(v) for v in versions],
        current_version=resource.current_version if resource else None
    )


@router.delete("/{resource_id}/history/{version_id}")
async def delete_static_resource_history(
    cluster_id: int,
    resource_id: int,
    version_id: int,
    db: AsyncSession = Depends(get_db),
):
    from app.models.cluster import ConfigVersion

    result = await db.execute(
        select(ConfigVersion).where(
            ConfigVersion.id == version_id,
            ConfigVersion.resource_type == "static_resource",
            ConfigVersion.resource_id == resource_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="历史版本不存在")

    await db.delete(version)
    await db.commit()
    return {"message": "历史版本已删除"}


@router.post("/{resource_id}/rollback/{version}")
async def rollback_static_resource(
    cluster_id: int,
    resource_id: int,
    version: int,
    db: AsyncSession = Depends(get_db),
):
    from app.models.cluster import ConfigVersion

    sr = await db.execute(
        select(StaticResource).where(StaticResource.id == resource_id, StaticResource.cluster_id == cluster_id)
    )
    resource = sr.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="静态资源不存在")

    cv = await db.execute(
        select(ConfigVersion).where(
            ConfigVersion.resource_type == "static_resource",
            ConfigVersion.resource_id == resource_id,
            ConfigVersion.version == version,
        )
    )
    config_version = cv.scalar_one_or_none()
    if not config_version:
        raise HTTPException(status_code=404, detail="版本不存在")

    config_data = json.loads(config_version.config)
    resource.storage_path = config_data.get("file_path", resource.storage_path)
    resource.file_size = config_data.get("file_size", resource.file_size)
    resource.current_version = version
    await db.commit()

    return {"message": f"已回滚到版本 v{version}", "current_version": version}
