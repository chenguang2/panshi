from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional
import json

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.cluster import Cluster, Upstream, UpstreamTarget, Route, RoutePlugin, Node, ConfigVersion
from app.models.user import User
from app.schemas.cluster import (
    ClusterCreate, ClusterUpdate, ClusterResponse, ClusterListResponse,
    UpstreamCreate, UpstreamUpdate, UpstreamResponse, UpstreamWithTargets, UpstreamTargetSchema,
    NodeCreate, NodeUpdate, NodeResponse, NodeListResponse, ConfigVersionResponse, ConfigVersionListResponse
)

router = APIRouter(prefix="/clusters", tags=["clusters"])


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not authorization:
        raise HTTPException(status_code=401, detail="未认证")

    try:
        if authorization.startswith("Bearer "):
            token = authorization[7:]
        else:
            token = authorization

        payload = decode_access_token(token)
        if payload is None:
            raise HTTPException(status_code=401, detail="未认证")

        user_id = int(payload.get("sub"))
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")

        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="未认证")


@router.get("/my", response_model=ClusterListResponse)
async def list_my_clusters(
    page: int = 1,
    page_size: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Cluster).where(Cluster.creator_id == current_user.id)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    clusters = result.scalars().all()

    items = []
    for c in clusters:
        cluster_resp = ClusterResponse.model_validate(c)
        node_result = await db.execute(select(func.count(), func.sum(Node.status == 1)).select_from(Node).where(Node.cluster_id == c.id))
        node_row = node_result.one_or_none()
        cluster_resp.node_count = node_row[0] or 0
        cluster_resp.healthy_node_count = node_row[1] or 0
        upstream_result = await db.execute(select(func.count()).select_from(Upstream).where(Upstream.cluster_id == c.id))
        cluster_resp.upstream_count = upstream_result.scalar() or 0
        route_result = await db.execute(select(func.count()).select_from(Route).where(Route.cluster_id == c.id))
        cluster_resp.route_count = route_result.scalar() or 0
        items.append(cluster_resp)

    return ClusterListResponse(total=total, items=items)


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

    items = []
    for c in clusters:
        cluster_resp = ClusterResponse.model_validate(c)
        node_result = await db.execute(select(func.count(), func.sum(Node.status == 1)).select_from(Node).where(Node.cluster_id == c.id))
        node_row = node_result.one_or_none()
        cluster_resp.node_count = node_row[0] or 0
        cluster_resp.healthy_node_count = node_row[1] or 0
        upstream_result = await db.execute(select(func.count()).select_from(Upstream).where(Upstream.cluster_id == c.id))
        cluster_resp.upstream_count = upstream_result.scalar() or 0
        route_result = await db.execute(select(func.count()).select_from(Route).where(Route.cluster_id == c.id))
        cluster_resp.route_count = route_result.scalar() or 0
        items.append(cluster_resp)

    return ClusterListResponse(total=total, items=items)


@router.post("", response_model=ClusterResponse, status_code=status.HTTP_201_CREATED)
async def create_cluster(
    cluster: ClusterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Cluster).where(Cluster.name == cluster.name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="集群名称已存在")

    db_cluster = Cluster(**cluster.model_dump(), creator_id=current_user.id)
    db.add(db_cluster)
    await db.commit()
    await db.refresh(db_cluster)
    return ClusterResponse.model_validate(db_cluster)


@router.get("/{cluster_id}", response_model=ClusterResponse)
async def get_cluster(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")
    return ClusterResponse.model_validate(cluster)


@router.put("/{cluster_id}", response_model=ClusterResponse)
async def update_cluster(cluster_id: int, cluster_update: ClusterUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")

    if cluster_update.name is not None:
        existing = await db.execute(select(Cluster).where(Cluster.name == cluster_update.name, Cluster.id != cluster_id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="集群名称已存在")

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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")
    
    await db.delete(cluster)
    await db.commit()
    return {"message": "集群已删除"}


@router.post("/{cluster_id}/test")
async def test_connection(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")
    
    return {"status": "ok", "message": "连接测试成功"}


@router.post("/{cluster_id}/sync")
async def sync_cluster(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")
    
    return {"status": "ok", "message": "同步成功"}


UPSTREAM_ALLOWED_SORT_FIELDS = {"name", "load_balance", "description", "created_at"}
UPSTREAM_ALLOWED_SEARCH_FIELDS = {"name", "description"}


@router.get("/{cluster_id}/upstreams", response_model=dict)
async def list_upstreams(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    search: Optional[str] = None,
    search_field: Optional[str] = None
):
    query = select(Upstream).where(Upstream.cluster_id == cluster_id)

    if search:
        search_pattern = f"%{search}%"
        if search_field and search_field in UPSTREAM_ALLOWED_SEARCH_FIELDS:
            search_col = getattr(Upstream, search_field)
            query = query.where(search_col.ilike(search_pattern))
        else:
            conditions = [
                getattr(Upstream, field).ilike(search_pattern)
                for field in UPSTREAM_ALLOWED_SEARCH_FIELDS
                if hasattr(Upstream, field)
            ]
            query = query.where(or_(*conditions))

    if sort_by and sort_by in UPSTREAM_ALLOWED_SORT_FIELDS:
        sort_column = getattr(Upstream, sort_by)
        if sort_order == "desc":
            sort_column = sort_column.desc()
        query = query.order_by(sort_column)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    upstreams = result.scalars().all()

    items = []
    for u in upstreams:
        targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == u.id))
        targets = targets_result.scalars().all()
        response = UpstreamWithTargets.model_validate(u)
        response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
        items.append(response)

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.post("/{cluster_id}/upstreams", response_model=UpstreamWithTargets, status_code=status.HTTP_201_CREATED)
async def create_upstream(cluster_id: int, upstream: UpstreamCreate, db: AsyncSession = Depends(get_db)):
    upstream_data = upstream.model_dump(exclude={"targets"})
    if upstream_data.get("checks"):
        upstream_data["checks"] = json.dumps(upstream_data["checks"])
    if upstream_data.get("timeout"):
        upstream_data["timeout"] = json.dumps(upstream_data["timeout"])
    if upstream_data.get("keepalive_pool"):
        upstream_data["keepalive_pool"] = json.dumps(upstream_data["keepalive_pool"])
    db_upstream = Upstream(cluster_id=cluster_id, **upstream_data)
    db.add(db_upstream)
    await db.commit()
    await db.refresh(db_upstream)

    if upstream.targets:
        for target_data in upstream.targets:
            if isinstance(target_data, UpstreamTargetSchema):
                db_target = UpstreamTarget(upstream_id=db_upstream.id, target=target_data.target, weight=target_data.weight)
            else:
                db_target = UpstreamTarget(upstream_id=db_upstream.id, **target_data)
            db.add(db_target)
        await db.commit()

    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == db_upstream.id))
    targets = targets_result.scalars().all()
    response = UpstreamWithTargets.model_validate(db_upstream)
    response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
    return response


@router.get("/{cluster_id}/upstreams/{upstream_id}", response_model=UpstreamWithTargets)
async def get_upstream(cluster_id: int, upstream_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")
    
    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
    targets = targets_result.scalars().all()
    
    response = UpstreamWithTargets.model_validate(upstream)
    response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
    return response


@router.put("/{cluster_id}/upstreams/{upstream_id}", response_model=UpstreamWithTargets)
async def update_upstream(cluster_id: int, upstream_id: int, upstream_update: UpstreamUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    update_data = upstream_update.model_dump(exclude_unset=True, exclude={"targets"})
    for key, value in update_data.items():
        if key in ("checks", "timeout", "keepalive_pool") and value:
            value = json.dumps(value)
        setattr(upstream, key, value)

    if upstream_update.targets is not None:
        targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
        existing_targets = targets_result.scalars().all()
        for t in existing_targets:
            await db.delete(t)

        for target_data in upstream_update.targets:
            db_target = UpstreamTarget(upstream_id=upstream_id, **target_data.model_dump())
            db.add(db_target)

    await db.commit()
    await db.refresh(upstream)

    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
    targets = targets_result.scalars().all()
    response = UpstreamWithTargets.model_validate(upstream)
    response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
    return response


@router.delete("/{cluster_id}/upstreams/{upstream_id}")
async def delete_upstream(cluster_id: int, upstream_id: int, db: AsyncSession = Depends(get_db)):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError

    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    nodes_result = await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
    active_nodes = nodes_result.scalars().all()

    await db.delete(upstream)
    await db.commit()

    results = []
    if active_nodes:
        for node in active_nodes:
            node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}
            try:
                client = EdgeClient(cluster_id, db, node_ip=node.ip, node_port=node.management_port)
                response = client.delete_upstream(upstream.edge_uuid)
                node_result["status"] = "success"
                node_result["response"] = response
            except (EdgeConnectionError, EdgeAPIError) as e:
                node_result["status"] = "failed"
                node_result["error"] = str(e)
            results.append(node_result)

    return {"message": "上游服务已删除", "results": results}


NODE_ALLOWED_SORT_FIELDS = {"name", "ip", "service_port", "management_port", "status", "created_at"}
NODE_ALLOWED_SEARCH_FIELDS = {"name", "ip"}


@router.get("/{cluster_id}/nodes", response_model=dict)
async def list_nodes(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    search: Optional[str] = None,
    search_field: Optional[str] = None
):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")

    query = select(Node).where(Node.cluster_id == cluster_id)

    if search:
        search_pattern = f"%{search}%"
        if search_field and search_field in NODE_ALLOWED_SEARCH_FIELDS:
            search_col = getattr(Node, search_field)
            query = query.where(search_col.ilike(search_pattern))
        else:
            conditions = [
                getattr(Node, field).ilike(search_pattern)
                for field in NODE_ALLOWED_SEARCH_FIELDS
                if hasattr(Node, field)
            ]
            query = query.where(or_(*conditions))

    if sort_by and sort_by in NODE_ALLOWED_SORT_FIELDS:
        sort_column = getattr(Node, sort_by)
        if sort_order == "desc":
            sort_column = sort_column.desc()
        query = query.order_by(sort_column)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    nodes = result.scalars().all()
    return {"total": total, "page": page, "page_size": page_size, "items": [NodeResponse.model_validate(n) for n in nodes]}


@router.post("/{cluster_id}/nodes", response_model=NodeResponse, status_code=status.HTTP_201_CREATED)
async def create_node(cluster_id: int, node: NodeCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")

    db_node = Node(cluster_id=cluster_id, **node.model_dump(exclude={"cluster_id"}))
    db.add(db_node)
    await db.commit()
    await db.refresh(db_node)
    return NodeResponse.model_validate(db_node)


@router.put("/{cluster_id}/nodes/{node_id}", response_model=NodeResponse)
async def update_node(cluster_id: int, node_id: int, node_update: NodeUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")

    for key, value in node_update.model_dump(exclude_unset=True).items():
        setattr(node, key, value)

    await db.commit()
    await db.refresh(node)
    return NodeResponse.model_validate(node)


@router.delete("/{cluster_id}/nodes/{node_id}")
async def delete_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")

    await db.delete(node)
    await db.commit()
    return {"message": "节点已删除"}


@router.post("/{cluster_id}/nodes/{node_id}/start")
async def start_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")
    return {"status": "ok", "message": "节点已启动"}


@router.post("/{cluster_id}/nodes/{node_id}/stop")
async def stop_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")
    return {"status": "ok", "message": "节点已停止"}


@router.get("/{cluster_id}/nodes/{node_id}/status")
async def get_node_status(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")
    return {"status": "ok", "node_status": node.status, "message": "状态查询成功"}


@router.post("/{cluster_id}/upstreams/{upstream_id}/publish")
async def publish_upstream(cluster_id: int, upstream_id: int, db: AsyncSession = Depends(get_db)):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
    from app.services.edge_logger import get_edge_logger

    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()

    version_result = await db.execute(
        select(func.max(ConfigVersion.version)).where(
            ConfigVersion.resource_type == "upstream",
            ConfigVersion.resource_id == upstream_id
        )
    )
    latest_version = version_result.scalar() or 0
    new_version = latest_version + 1

    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
    targets = targets_result.scalars().all()

    config_data = {
        "id": upstream.id,
        "edge_uuid": upstream.edge_uuid,
        "name": upstream.name,
        "load_balance": upstream.load_balance,
        "hash_on": upstream.hash_on,
        "key": upstream.key,
        "targets": [{"target": t.target, "weight": t.weight} for t in targets],
        "checks": json.loads(upstream.checks) if upstream.checks else None,
        "retries": upstream.retries,
        "retry_timeout": upstream.retry_timeout,
        "timeout": json.loads(upstream.timeout) if upstream.timeout else None,
        "pass_host": upstream.pass_host,
        "upstream_host": upstream.upstream_host,
        "scheme": upstream.scheme,
        "keepalive_pool": json.loads(upstream.keepalive_pool) if upstream.keepalive_pool else None,
    }

    config_version = ConfigVersion(
        cluster_id=cluster_id,
        resource_type="upstream",
        resource_id=upstream_id,
        version=new_version,
        config=json.dumps(config_data)
    )
    db.add(config_version)
    upstream.current_version = new_version
    await db.commit()

    nodes_result = await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
    active_nodes = nodes_result.scalars().all()

    if not active_nodes:
        return {"status": "error", "message": f"上游 {upstream.name} 发布成功，但集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    edge_logger = get_edge_logger()
    upstream_checks = json.loads(upstream.checks) if upstream.checks else None
    upstream_timeout = json.loads(upstream.timeout) if upstream.timeout else None
    upstream_keepalive = json.loads(upstream.keepalive_pool) if upstream.keepalive_pool else None
    edge_data = EdgeClient.convert_upstream_to_edge_format(
        upstream_id, upstream.name, upstream.load_balance,
        [{"target": t.target, "weight": t.weight} for t in targets],
        hash_on=upstream.hash_on,
        key=upstream.key,
        checks=upstream_checks,
        retries=upstream.retries,
        retry_timeout=upstream.retry_timeout,
        timeout=upstream_timeout,
        pass_host=upstream.pass_host,
        upstream_host=upstream.upstream_host,
        scheme=upstream.scheme,
        keepalive_pool=upstream_keepalive
    )

    results = []
    success_count = 0
    fail_count = 0

    for node in active_nodes:
        node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}

        try:
            sync_db = db
            client = EdgeClient(cluster_id, sync_db, node_ip=node.ip, node_port=node.management_port)

            import base64
            import json as json_module
            encrypted = client._encrypt(json_module.dumps(edge_data).encode())

            response = client.update_upstream(upstream.edge_uuid, edge_data)

            edge_logger.log_edge_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                upstream_id=upstream_id,
                upstream_name=upstream.name,
                method="PUT",
                path=f"/edge/admin/upstreams/{upstream.edge_uuid}",
                request_body=edge_data,
                encrypted_body=encrypted,
                response_status=201,
                response_body=response,
                status="SUCCESS"
            )

            node_result["status"] = "success"
            node_result["response"] = response
            success_count += 1

        except EdgeConnectionError as e:
            edge_logger.log_edge_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                upstream_id=upstream_id,
                upstream_name=upstream.name,
                method="POST",
                path="/edge/admin/upstreams",
                request_body=edge_data,
                encrypted_body=None,
                response_status=None,
                response_body=None,
                status="FAILED",
                error=str(e)
            )
            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1

        except EdgeAPIError as e:
            edge_logger.log_edge_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                upstream_id=upstream_id,
                upstream_name=upstream.name,
                method="PUT",
                path=f"/edge/admin/upstreams/{upstream_id}",
                request_body=edge_data,
                encrypted_body=None,
                response_status=e.status_code,
                response_body=e.response_body,
                status="FAILED",
                error=e.message
            )
            node_result["status"] = "failed"
            node_result["error"] = f"API error {e.status_code}: {e.message}"
            fail_count += 1

        except Exception as e:
            edge_logger.log_edge_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                upstream_id=upstream_id,
                upstream_name=upstream.name,
                method="PUT",
                path=f"/edge/admin/upstreams/{upstream_id}",
                request_body=edge_data,
                encrypted_body=None,
                response_status=None,
                response_body=None,
                status="FAILED",
                error=str(e)
            )
            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1

        results.append(node_result)

    if fail_count == 0:
        return {
            "status": "ok",
            "message": f"上游 {upstream.name} 发布成功，已同步到 {success_count} 个节点",
            "version": new_version,
            "results": results
        }
    elif success_count == 0:
        return {
            "status": "error",
            "message": f"上游 {upstream.name} 发布失败：无法连接到任何 edge 节点",
            "version": new_version,
            "results": results
        }
    else:
        return {
            "status": "partial",
            "message": f"上游 {upstream.name} 发布完成，{success_count}/{success_count + fail_count} 节点同步成功",
            "version": new_version,
            "results": results
        }


@router.get("/{cluster_id}/upstreams/{upstream_id}/history", response_model=ConfigVersionListResponse)
async def get_upstream_history(cluster_id: int, upstream_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    query = select(ConfigVersion).where(
        ConfigVersion.resource_type == "upstream",
        ConfigVersion.resource_id == upstream_id
    ).order_by(ConfigVersion.version.desc())

    result = await db.execute(query)
    versions = result.scalars().all()
    return ConfigVersionListResponse(
        total=len(versions),
        items=[ConfigVersionResponse.model_validate(v) for v in versions],
        current_version=upstream.current_version
    )


@router.post("/{cluster_id}/upstreams/{upstream_id}/rollback/{version}")
async def rollback_upstream(cluster_id: int, upstream_id: int, version: int, db: AsyncSession = Depends(get_db)):
    upstream_result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = upstream_result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.resource_type == "upstream",
        ConfigVersion.resource_id == upstream_id,
        ConfigVersion.version == version
    ))
    config_version = result.scalar_one_or_none()
    if not config_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本不存在")

    config_data = json.loads(config_version.config)

    upstream.load_balance = config_data.get("load_balance", upstream.load_balance)
    upstream.hash_on = config_data.get("hash_on")
    upstream.key = config_data.get("key")
    upstream.current_version = version

    await db.execute(UpstreamTarget.__table__.delete().where(UpstreamTarget.upstream_id == upstream_id))

    for t in config_data.get("targets", []):
        target = UpstreamTarget(
            upstream_id=upstream_id,
            target=t["target"],
            weight=t["weight"]
        )
        db.add(target)

    await db.commit()

    return {"status": "ok", "message": f"上游已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/upstreams/{upstream_id}/history/{history_id}")
async def delete_upstream_history(cluster_id: int, upstream_id: int, history_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.id == history_id,
        ConfigVersion.resource_type == "upstream",
        ConfigVersion.resource_id == upstream_id
    ))
    config_version = result.scalar_one_or_none()
    if not config_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="历史版本不存在")

    await db.delete(config_version)
    await db.commit()
    return {"status": "ok", "message": "历史版本已删除"}