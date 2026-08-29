import json
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_db
from app.models.cluster import Upstream, UpstreamTarget, ConfigVersion, Node, Route
from app.models.user import User
from app.schemas.cluster import (
    UpstreamCreate, UpstreamUpdate,
    UpstreamWithTargets, UpstreamTargetSchema,
    ConfigVersionListResponse,
    DeleteClusterRequest, PublishRequest, BatchDeleteUpstreamsRequest,
)
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services import edge_sync
from app.core.deps import get_current_user

router = APIRouter(prefix="/clusters", tags=["clusters"])

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
    else:
        # 默认按名称升序
        query = query.order_by(Upstream.name)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    upstreams = result.scalars().all()

    # 批量查询最新发布时间
    upstream_ids = [u.id for u in upstreams]
    pub_result = await db.execute(
        select(
            ConfigVersion.resource_id,
            func.max(ConfigVersion.created_at).label("latest_ts")
        ).where(
            ConfigVersion.resource_type == "upstream",
            ConfigVersion.resource_id.in_(upstream_ids) if upstream_ids else False
        ).group_by(ConfigVersion.resource_id)
    )
    pub_map = {r.resource_id: r.latest_ts for r in pub_result.all()} if upstream_ids else {}

    items = []
    for u in upstreams:
        targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == u.id))
        targets = targets_result.scalars().all()
        response = UpstreamWithTargets.model_validate(u)
        response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
        response.current_version = u.current_version
        ts = pub_map.get(u.id)
        response.published_at = ts.isoformat() + 'Z' if ts else None
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
    upstream = await edge_sync.get_or_404(db, Upstream, id=upstream_id, cluster_id=cluster_id, detail="上游服务不存在")

    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
    targets = targets_result.scalars().all()

    response = UpstreamWithTargets.model_validate(upstream)
    response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
    return response


@router.put("/{cluster_id}/upstreams/{upstream_id}", response_model=UpstreamWithTargets)
async def update_upstream(cluster_id: int, upstream_id: int, upstream_update: UpstreamUpdate, db: AsyncSession = Depends(get_db)):
    upstream = await edge_sync.get_or_404(db, Upstream, id=upstream_id, cluster_id=cluster_id, detail="上游服务不存在")

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
async def delete_upstream(cluster_id: int, upstream_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db)):
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    upstream = await edge_sync.get_or_404(db, Upstream, id=upstream_id, cluster_id=cluster_id, detail="上游服务不存在")

    results = []

    if body.delete_db:
        await db.execute(UpstreamTarget.__table__.delete().where(UpstreamTarget.upstream_id == upstream_id))
        await db.execute(ConfigVersion.__table__.delete().where(ConfigVersion.resource_type == "upstream", ConfigVersion.resource_id == upstream_id))
        await db.delete(upstream)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        if not upstream.edge_uuid:
            results.append({
                "scope": "edge", "status": "skipped",
                "message": "该上游无 edge_uuid，跳过 Edge 同步",
            })
        else:
            active_nodes = await edge_sync.get_active_nodes(cluster_id, db, body.node_ids if body.node_ids else None)
            edge_results = await edge_sync.delete_on_nodes(
                cluster_id, active_nodes, upstream.edge_uuid,
                lambda client, uuid: client.delete_upstream(uuid)
            )
            results.extend(edge_results)

    return {"message": "上游服务已删除", "results": results}


@router.delete("/{cluster_id}/upstreams")
async def delete_upstreams_batch(cluster_id: int, body: BatchDeleteUpstreamsRequest = Body(...), db: AsyncSession = Depends(get_db)):
    """批量删除同一集群内的多条上游。

    每条上游独立处理：单条失败（上游不存在 / 被路由引用 / Edge 同步失败 / 其他异常）
    不阻塞其余上游。被路由引用的上游无条件拦截（与 delete_db/delete_edge 组合无关）。
    edge_uuid 为空的上游跳过 Edge 同步并记 skipped。
    """

    if not body.upstream_ids:
        raise HTTPException(status_code=400, detail="upstream_ids 不能为空")

    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    active_nodes = await edge_sync.get_active_nodes(cluster_id, db, body.node_ids if body.node_ids else None)

    results = []
    for upstream_id in body.upstream_ids:
        upstream_result: dict = {
            "upstream_id": upstream_id,
            "upstream_name": "",
            "status": "failed",
            "results": [],
        }
        try:
            upstream = await edge_sync.get_or_404(db, Upstream, id=upstream_id, cluster_id=cluster_id, detail="上游服务不存在")
            upstream_result["upstream_name"] = upstream.name

            linked = await db.execute(select(Route).where(Route.upstream_id == upstream_id))
            if linked.scalars().first() is not None:
                upstream_result["error"] = "该上游已被路由引用，请先删除引用路由"
                results.append(upstream_result)
                continue

            if body.delete_db:
                await db.execute(UpstreamTarget.__table__.delete().where(UpstreamTarget.upstream_id == upstream_id))
                await db.execute(ConfigVersion.__table__.delete().where(ConfigVersion.resource_type == "upstream", ConfigVersion.resource_id == upstream_id))
                await db.delete(upstream)
                await db.commit()
                upstream_result["results"].append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

            if body.delete_edge:
                if not upstream.edge_uuid:
                    upstream_result["results"].append({
                        "scope": "edge", "status": "skipped",
                        "message": "该上游无 edge_uuid，跳过 Edge 同步",
                    })
                else:
                    edge_results = await edge_sync.delete_on_nodes(
                        cluster_id, active_nodes, upstream.edge_uuid,
                        lambda client, uuid: client.delete_upstream(uuid)
                    )
                    upstream_result["results"].extend(edge_results)

            upstream_result["status"] = "success"
        except HTTPException as e:
            upstream_result["error"] = str(e.detail)
        except Exception as e:  # noqa: BLE001 - 单条失败不阻塞其余
            await db.rollback()
            upstream_result["error"] = str(e)
        results.append(upstream_result)

    return {"message": f"批量删除完成: {len(results)} 条上游", "results": results}


@router.post("/{cluster_id}/upstreams/{upstream_id}/publish")
async def publish_upstream(cluster_id: int, upstream_id: int, req: Optional[PublishRequest] = None, db: AsyncSession = Depends(get_db)):
    upstream = await edge_sync.get_or_404(db, Upstream, id=upstream_id, cluster_id=cluster_id, detail="上游服务不存在")

    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
    targets = targets_result.scalars().all()
    targets_list = [{"target": t.target, "weight": t.weight} for t in targets]

    config_data = {
        "id": upstream.id, "edge_uuid": upstream.edge_uuid, "name": upstream.name,
        "load_balance": upstream.load_balance, "hash_on": upstream.hash_on, "key": upstream.key,
        "targets": targets_list,
        "checks": json.loads(upstream.checks) if upstream.checks else None,
        "retries": upstream.retries, "retry_timeout": upstream.retry_timeout,
        "timeout": json.loads(upstream.timeout) if upstream.timeout else None,
        "pass_host": upstream.pass_host, "upstream_host": upstream.upstream_host,
        "scheme": upstream.scheme,
        "keepalive_pool": json.loads(upstream.keepalive_pool) if upstream.keepalive_pool else None,
    }

    upstream_checks = json.loads(upstream.checks) if upstream.checks else None
    upstream_timeout = json.loads(upstream.timeout) if upstream.timeout else None
    upstream_keepalive = json.loads(upstream.keepalive_pool) if upstream.keepalive_pool else None
    edge_data = EdgeClient.convert_upstream_to_edge_format(
        upstream_id, upstream.name, upstream.load_balance, targets_list,
        hash_on=upstream.hash_on, key=upstream.key,
        checks=upstream_checks, retries=upstream.retries, retry_timeout=upstream.retry_timeout,
        timeout=upstream_timeout, pass_host=upstream.pass_host, upstream_host=upstream.upstream_host,
        scheme=upstream.scheme, keepalive_pool=upstream_keepalive)

    return await edge_sync.publish_resource(
        db, cluster_id=cluster_id, resource=upstream, resource_type="upstream",
        config_data=config_data, edge_data=edge_data,
        publish_fn=lambda client: client.update_upstream(upstream.edge_uuid, edge_data),
        display_name=f"上游 {upstream.name} ",
        log_path=f"/edge/admin/upstreams/{upstream.edge_uuid}",
        log_resource_id=upstream_id, log_resource_name=upstream.name,
        node_ids=req.node_ids if req else None,
        no_nodes_message=f"上游 {upstream.name} 发布成功，但集群中没有活跃的 edge 节点",
    )


@router.get("/{cluster_id}/upstreams/{upstream_id}/history", response_model=ConfigVersionListResponse)
async def get_upstream_history(cluster_id: int, upstream_id: int, db: AsyncSession = Depends(get_db)):
    upstream = await edge_sync.get_or_404(db, Upstream, id=upstream_id, cluster_id=cluster_id, detail="上游服务不存在")
    return await edge_sync.list_config_versions(
        db, resource_type="upstream", resource_id=upstream_id,
        current_version=upstream.current_version)


@router.post("/{cluster_id}/upstreams/{upstream_id}/rollback/{version}")
async def rollback_upstream(cluster_id: int, upstream_id: int, version: int, db: AsyncSession = Depends(get_db)):
    upstream_result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = upstream_result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    config_version = await edge_sync.get_or_404(db, ConfigVersion, resource_type="upstream", resource_id=upstream_id, version=version, detail="版本不存在")

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
    await edge_sync.delete_config_version(db, resource_type="upstream", resource_id=upstream_id, history_id=history_id)
    return {"status": "ok", "message": "历史版本已删除"}
