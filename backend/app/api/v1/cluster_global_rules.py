import json
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.cluster import Cluster, GlobalRule, ConfigVersion, Node
from app.models.user import User
from app.schemas.cluster import (
    GlobalRuleCreate, GlobalRuleUpdate, GlobalRuleResponse,
    ConfigVersionListResponse,
    DeleteClusterRequest, PublishRequest,
)
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services.edge_logger import get_edge_logger
from app.services import edge_sync
from app.api.v1.clusters import get_current_user

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get("/{cluster_id}/global_rules", response_model=dict)
async def list_global_rules(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlobalRule).where(GlobalRule.cluster_id == cluster_id).order_by(GlobalRule.id))
    rules = result.scalars().all()
    # 批量查询最新发布时间
    gr_ids = [g.id for g in rules]
    pub = await db.execute(
        select(ConfigVersion.resource_id, func.max(ConfigVersion.created_at).label("ts"))
        .where(ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id.in_(gr_ids) if gr_ids else False)
        .group_by(ConfigVersion.resource_id)
    ) if gr_ids else None
    pub_map = {r.resource_id: r.ts for r in pub.all()} if pub else {}
    response = []
    for g in rules:
        r = GlobalRuleResponse.model_validate(g)
        ts = pub_map.get(g.id)
        r.published_at = ts.isoformat() + 'Z' if ts else None
        response.append(r)
    return {"total": len(response), "items": response}


@router.post("/{cluster_id}/global_rules", response_model=GlobalRuleResponse)
async def create_global_rule(cluster_id: int, data: GlobalRuleCreate, db: AsyncSession = Depends(get_db)):
    rule_data = data.model_dump()
    if rule_data.get("plugins") is not None:
        rule_data["plugins"] = json.dumps(rule_data["plugins"])
    db_rule = GlobalRule(cluster_id=cluster_id, **rule_data)
    db.add(db_rule)
    await db.commit()
    await db.refresh(db_rule)
    return GlobalRuleResponse.model_validate(db_rule)


@router.get("/{cluster_id}/global_rules/{rule_id}", response_model=GlobalRuleResponse)
async def get_global_rule(cluster_id: int, rule_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="全局规则不存在")
    return GlobalRuleResponse.model_validate(rule)


@router.put("/{cluster_id}/global_rules/{rule_id}", response_model=GlobalRuleResponse)
async def update_global_rule(cluster_id: int, rule_id: int, data: GlobalRuleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="全局规则不存在")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "plugins" and value is not None:
            value = json.dumps(value)
        setattr(rule, key, value)
    await db.commit()
    await db.refresh(rule)
    return GlobalRuleResponse.model_validate(rule)


@router.delete("/{cluster_id}/global_rules/{rule_id}")
async def delete_global_rule(cluster_id: int, rule_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db)):
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="全局规则不存在")

    results = []

    if body.delete_db:
        await db.execute(ConfigVersion.__table__.delete().where(ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id == rule_id))
        await db.delete(rule)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db, body.node_ids if body.node_ids else None)
        edge_results = await edge_sync.delete_on_nodes(
            cluster_id, active_nodes, rule.edge_uuid,
            lambda client, uuid: client.delete_global_rule(uuid)
        )
        results.extend(edge_results)

    return {"message": "全局规则已删除", "results": results}


@router.post("/{cluster_id}/global_rules/{rule_id}/publish")
async def publish_global_rule(cluster_id: int, rule_id: int, req: Optional[PublishRequest] = None, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="全局规则不存在")
    rule_plugins = json.loads(rule.plugins) if rule.plugins else None
    version_result = await db.execute(
        select(func.max(ConfigVersion.version)).where(
            ConfigVersion.resource_type == "global_rule",
            ConfigVersion.resource_id == rule_id))
    latest_version = version_result.scalar() or 0
    new_version = latest_version + 1
    event_data = {"id": rule.id, "edge_uuid": rule.edge_uuid, "name": rule.name, "description": rule.description, "plugins": rule_plugins}
    config_version = ConfigVersion(
        cluster_id=cluster_id, resource_type="global_rule", resource_id=rule_id,
        version=new_version, config=json.dumps(event_data))
    db.add(config_version)
    rule.current_version = new_version
    await db.commit()
    edge_data = {"desc": rule.name, "plugins": rule_plugins or {}}

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()

    if req and req.node_ids:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db, req.node_ids)
    else:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db)

    if not active_nodes:
        return {"status": "error", "message": "集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    edge_logger = get_edge_logger()
    results, success_count, fail_count = [], 0, 0
    for node in active_nodes:
        node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}
        try:
            client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)

            import base64
            import json as json_module
            encrypted = client._encrypt(json_module.dumps(edge_data).encode())
            response = client.create_global_rule(rule.edge_uuid, edge_data)

            edge_logger.log_global_rule_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                rule_id=rule_id,
                rule_name=rule.name,
                method="PUT",
                path=f"/edge/admin/global_rules/{rule.edge_uuid}",
                request_body=edge_data,
                encrypted_body=encrypted,
                response_status=201,
                response_body=response,
                status="SUCCESS"
            )

            node_result["status"] = "success"
            node_result["response"] = response
            success_count += 1
        except (EdgeConnectionError, EdgeAPIError) as e:
            edge_logger.log_global_rule_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                rule_id=rule_id,
                rule_name=rule.name,
                method="PUT",
                path=f"/edge/admin/global_rules/{rule.edge_uuid}",
                request_body=edge_data,
                encrypted_body=None,
                response_status=e.status_code if isinstance(e, EdgeAPIError) else None,
                response_body=e.response_body if isinstance(e, EdgeAPIError) else None,
                status="FAILED",
                error=str(e)
            )
            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1
        results.append(node_result)

    return edge_sync.build_publish_response(results, success_count, fail_count, len(active_nodes), "全局规则", new_version)


@router.get("/{cluster_id}/global_rules/{rule_id}/history", response_model=ConfigVersionListResponse)
async def get_global_rule_history(cluster_id: int, rule_id: int, db: AsyncSession = Depends(get_db)):
    query = select(ConfigVersion).where(
        ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id == rule_id
    ).order_by(ConfigVersion.version.desc())
    result = await db.execute(query)
    versions = result.scalars().all()
    gr = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = gr.scalar_one_or_none()
    return ConfigVersionListResponse(total=len(versions), items=versions, current_version=rule.current_version if rule else None)


@router.post("/{cluster_id}/global_rules/{rule_id}/rollback/{version}")
async def rollback_global_rule(cluster_id: int, rule_id: int, version: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="全局规则不存在")
    cv_result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id == rule_id, ConfigVersion.version == version))
    cv = cv_result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本不存在")
    config_data = json.loads(cv.config)
    rule.name = config_data.get("name", rule.name)
    rule.description = config_data.get("description")
    if config_data.get("plugins") is not None:
        rule.plugins = json.dumps(config_data["plugins"])
    else:
        rule.plugins = None
    rule.current_version = version
    await db.commit()
    return {"status": "ok", "message": f"全局规则已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/global_rules/{rule_id}/history/{history_id}")
async def delete_global_rule_history(cluster_id: int, rule_id: int, history_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.id == history_id, ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id == rule_id))
    cv = result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="历史版本不存在")
    await db.delete(cv)
    await db.commit()
    return {"message": "历史版本已删除"}
