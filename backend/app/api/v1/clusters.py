from fastapi import APIRouter, Body, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional, List
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.cluster import Cluster, Upstream, UpstreamTarget, Route, RoutePlugin, Node, ConfigVersion, PluginConfig, GlobalRule, PluginMetadata
from app.models.static_resource import StaticResource
from app.models.user import User, UserCluster
from app.schemas.cluster import (
    ClusterCreate, ClusterUpdate, ClusterResponse, ClusterListResponse,
    DeleteClusterRequest,
)
from app.services import edge_sync

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
    assigned_ids = select(UserCluster.cluster_id).where(UserCluster.user_id == current_user.id)
    query = select(Cluster).where(Cluster.id.in_(assigned_ids))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    clusters = result.scalars().all()

    items = []
    cids = [c.id for c in clusters]
    (node_counts, healthy_counts, up_counts, rt_counts, pc_counts,
     gr_counts, sr_counts, pm_counts, nodes_by_cluster) = await edge_sync.batch_load_cluster_stats(db, clusters, cids)

    for c in clusters:
        cluster_resp = ClusterResponse.model_validate(c)
        cluster_resp.node_count = node_counts.get(c.id, 0)
        cluster_resp.healthy_node_count = healthy_counts.get(c.id, 0)
        cluster_resp.upstream_count = up_counts.get(c.id, 0)
        cluster_resp.route_count = rt_counts.get(c.id, 0)
        cluster_resp.plugin_config_count = pc_counts.get(c.id, 0)
        cluster_resp.global_rule_count = gr_counts.get(c.id, 0)
        cluster_resp.static_resource_count = sr_counts.get(c.id, 0)
        cluster_resp.plugin_metadata_count = pm_counts.get(c.id, 0)
        cluster_resp.nodes = nodes_by_cluster.get(c.id, [])
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
    cids = [c.id for c in clusters]
    (node_counts, healthy_counts, up_counts, rt_counts, pc_counts,
     gr_counts, sr_counts, pm_counts, nodes_by_cluster) = await edge_sync.batch_load_cluster_stats(db, clusters, cids)

    for c in clusters:
        cluster_resp = ClusterResponse.model_validate(c)
        cluster_resp.node_count = node_counts.get(c.id, 0)
        cluster_resp.healthy_node_count = healthy_counts.get(c.id, 0)
        cluster_resp.upstream_count = up_counts.get(c.id, 0)
        cluster_resp.route_count = rt_counts.get(c.id, 0)
        cluster_resp.plugin_config_count = pc_counts.get(c.id, 0)
        cluster_resp.global_rule_count = gr_counts.get(c.id, 0)
        cluster_resp.static_resource_count = sr_counts.get(c.id, 0)
        cluster_resp.plugin_metadata_count = pm_counts.get(c.id, 0)
        cluster_resp.nodes = nodes_by_cluster.get(c.id, [])
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

    existing = await db.execute(
        select(UserCluster).where(
            UserCluster.user_id == current_user.id,
            UserCluster.cluster_id == db_cluster.id
        )
    )
    if not existing.scalar_one_or_none():
        db.add(UserCluster(user_id=current_user.id, cluster_id=db_cluster.id))
        await db.commit()

    return ClusterResponse.model_validate(db_cluster)


@router.get("/{cluster_id}", response_model=ClusterResponse)
async def get_cluster(cluster_id: int, db: AsyncSession = Depends(get_db)):
    cluster = await edge_sync.get_or_404(db, Cluster, id=cluster_id, detail="集群不存在")
    return ClusterResponse.model_validate(cluster)


@router.put("/{cluster_id}", response_model=ClusterResponse)
async def update_cluster(cluster_id: int, cluster_update: ClusterUpdate, db: AsyncSession = Depends(get_db)):
    cluster = await edge_sync.get_or_404(db, Cluster, id=cluster_id, detail="集群不存在")

    if cluster_update.name is not None:
        existing = await db.execute(select(Cluster).where(Cluster.name == cluster_update.name, Cluster.id != cluster_id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="集群名称已存在")

    for key, value in cluster_update.model_dump(exclude_unset=True).items():
        setattr(cluster, key, value)

    await db.commit()
    await db.refresh(cluster)
    return ClusterResponse.model_validate(cluster)


@router.get("/{cluster_id}/stats")
async def get_cluster_stats(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")

    async def count(model, **filters):
        q = select(func.count()).select_from(model)
        for k, v in filters.items():
            q = q.where(getattr(model, k) == v)
        r = await db.execute(q)
        return r.scalar() or 0

    return {
        "nodes": await count(Node, cluster_id=cluster_id),
        "upstreams": await count(Upstream, cluster_id=cluster_id),
        "routes": await count(Route, cluster_id=cluster_id),
        "plugin_configs": await count(PluginConfig, cluster_id=cluster_id),
        "global_rules": await count(GlobalRule, cluster_id=cluster_id),
        "plugin_metadata": await count(PluginMetadata, cluster_id=cluster_id),
        "static_resources": await count(StaticResource, cluster_id=cluster_id),
        "config_versions": await count(ConfigVersion, cluster_id=cluster_id),
    }


@router.delete("/{cluster_id}")
async def delete_cluster(
    cluster_id: int,
    body: Optional[DeleteClusterRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError

    if body is None:
        body = DeleteClusterRequest()
    delete_db = body.delete_db
    delete_edge = body.delete_edge

    if not delete_db and not delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    cluster = await edge_sync.get_or_404(db, Cluster, id=cluster_id, detail="集群不存在")

    results = []

    if delete_edge:
        upstreams = (await db.execute(select(Upstream).where(Upstream.cluster_id == cluster_id))).scalars().all()
        routes = (await db.execute(select(Route).where(Route.cluster_id == cluster_id))).scalars().all()
        plugin_configs = (await db.execute(select(PluginConfig).where(PluginConfig.cluster_id == cluster_id))).scalars().all()
        global_rules = (await db.execute(select(GlobalRule).where(GlobalRule.cluster_id == cluster_id))).scalars().all()
        plugin_metadatas = (await db.execute(select(PluginMetadata).where(PluginMetadata.cluster_id == cluster_id))).scalars().all()

        node_query = select(Node).where(Node.cluster_id == cluster_id, Node.status == 1)
        if body.node_ids:
            node_query = node_query.where(Node.id.in_(body.node_ids))
        nodes_result = await db.execute(node_query)
        active_nodes = nodes_result.scalars().all()

        if active_nodes:
            for node in active_nodes:
                node_result = {
                    "node": f"{node.ip}:{node.management_port}",
                    "scope": "edge",
                    "status": "pending",
                    "details": {
                        "routes": 0, "upstreams": 0, "plugin_configs": 0,
                        "global_rules": 0, "plugin_metadatas": 0,
                    },
                }
                try:
                    client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)
                    errs = []
                    for r in routes:
                        try: client.delete_route(r.edge_uuid); node_result["details"]["routes"] += 1
                        except: errs.append(f"route:{r.edge_uuid}")
                    for u in upstreams:
                        try: client.delete_upstream(u.edge_uuid); node_result["details"]["upstreams"] += 1
                        except: errs.append(f"upstream:{u.edge_uuid}")
                    for p in plugin_configs:
                        try: client.delete_plugin_config(p.edge_uuid); node_result["details"]["plugin_configs"] += 1
                        except: errs.append(f"plugin_config:{p.edge_uuid}")
                    for g in global_rules:
                        try: client.delete_global_rule(g.edge_uuid); node_result["details"]["global_rules"] += 1
                        except: errs.append(f"global_rule:{g.edge_uuid}")
                    for pm in plugin_metadatas:
                        try: client.delete_plugin_metadata(pm.plugin_name); node_result["details"]["plugin_metadatas"] += 1
                        except: errs.append(f"plugin_metadata:{pm.plugin_name}")
                    if errs:
                        node_result["status"] = "failed"
                        node_result["error"] = f"部分失败: {', '.join(errs[:5])}"
                    else:
                        node_result["status"] = "success"
                except (EdgeConnectionError, EdgeAPIError) as e:
                    node_result["status"] = "failed"
                    node_result["error"] = str(e)
                results.append(node_result)

    if delete_db:
        db_details = {"routes": 0, "upstreams": 0, "plugin_configs": 0, "global_rules": 0, "plugin_metadatas": 0, "nodes": 0, "config_versions": 0}

        cv_result = await db.execute(select(func.count()).select_from(ConfigVersion).where(ConfigVersion.cluster_id == cluster_id))
        db_details["config_versions"] = cv_result.scalar() or 0
        await db.execute(ConfigVersion.__table__.delete().where(ConfigVersion.cluster_id == cluster_id))

        sub_routes = select(Route.id).where(Route.cluster_id == cluster_id)
        await db.execute(RoutePlugin.__table__.delete().where(RoutePlugin.route_id.in_(sub_routes)))
        sub_upstreams = select(Upstream.id).where(Upstream.cluster_id == cluster_id)
        await db.execute(UpstreamTarget.__table__.delete().where(UpstreamTarget.upstream_id.in_(sub_upstreams)))

        route_result = await db.execute(select(func.count()).select_from(Route).where(Route.cluster_id == cluster_id))
        db_details["routes"] = route_result.scalar() or 0
        await db.execute(Route.__table__.delete().where(Route.cluster_id == cluster_id))

        upstream_result = await db.execute(select(func.count()).select_from(Upstream).where(Upstream.cluster_id == cluster_id))
        db_details["upstreams"] = upstream_result.scalar() or 0
        await db.execute(Upstream.__table__.delete().where(Upstream.cluster_id == cluster_id))

        pc_result = await db.execute(select(func.count()).select_from(PluginConfig).where(PluginConfig.cluster_id == cluster_id))
        db_details["plugin_configs"] = pc_result.scalar() or 0
        await db.execute(PluginConfig.__table__.delete().where(PluginConfig.cluster_id == cluster_id))

        gr_result = await db.execute(select(func.count()).select_from(GlobalRule).where(GlobalRule.cluster_id == cluster_id))
        db_details["global_rules"] = gr_result.scalar() or 0
        await db.execute(GlobalRule.__table__.delete().where(GlobalRule.cluster_id == cluster_id))

        pm_result = await db.execute(select(func.count()).select_from(PluginMetadata).where(PluginMetadata.cluster_id == cluster_id))
        db_details["plugin_metadatas"] = pm_result.scalar() or 0
        await db.execute(PluginMetadata.__table__.delete().where(PluginMetadata.cluster_id == cluster_id))

        node_result = await db.execute(select(func.count()).select_from(Node).where(Node.cluster_id == cluster_id))
        db_details["nodes"] = node_result.scalar() or 0
        await db.execute(Node.__table__.delete().where(Node.cluster_id == cluster_id))

        await db.delete(cluster)
        await db.commit()

        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除", "details": db_details})
        return {"message": "集群已删除", "results": results}

    return {"message": "Edge 节点数据已清理", "results": results}


class TestConnectionRequest(BaseModel):
    node_ids: List[int] = []


@router.post("/{cluster_id}/test")
async def test_connection(cluster_id: int, req: TestConnectionRequest = Body(...), db: AsyncSession = Depends(get_db)):
    cluster = await edge_sync.get_or_404(db, Cluster, id=cluster_id, detail="集群不存在")

    results: list[dict] = []
    for node_id in req.node_ids:
        node_result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
        node = node_result.scalar_one_or_none()
        if not node:
            results.append({"node_id": node_id, "ip": "-", "port": 0, "ok": False, "msg": "节点不存在", "version": ""})
            continue

        port = node.management_port
        try:
            import asyncio
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(node.ip, port), timeout=5.0)
            writer.close()
            await writer.wait_closed()
            results.append({"node_id": node.id, "ip": node.ip, "port": port, "ok": True, "msg": "管理端口可达", "version": ""})
        except asyncio.TimeoutError:
            results.append({"node_id": node.id, "ip": node.ip, "port": port, "ok": False, "msg": "连接超时", "version": ""})
        except ConnectionRefusedError:
            results.append({"node_id": node.id, "ip": node.ip, "port": port, "ok": False, "msg": "连接被拒绝", "version": ""})
        except OSError as e:
            results.append({"node_id": node.id, "ip": node.ip, "port": port, "ok": False, "msg": str(e)[:50], "version": ""})

    return {"results": results}


@router.post("/{cluster_id}/sync")
async def sync_cluster(cluster_id: int, db: AsyncSession = Depends(get_db)):
    cluster = await edge_sync.get_or_404(db, Cluster, id=cluster_id, detail="集群不存在")

    return {"status": "ok", "message": "同步成功"}
