import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.cluster import Cluster, Node, EdgeEnvVersion
from app.schemas.edge_env import (
    EdgeEnvReadResponse,
    EdgeEnvDeployRequest,
    EdgeEnvDeployResponse,
    EdgeEnvVersionListItem,
    EdgeEnvVersionResponse,
    NodeResultItem,
)
from app.services.ansible_service import AnsibleRunnerService, _run_ansible_stream
from app.utils.yaml_validator import validate_yaml

logger = logging.getLogger(__name__)

router = APIRouter(tags=["edge-env"])
_ansible_service = AnsibleRunnerService()


@router.get("/clusters/{cluster_id}/edge-env", response_model=EdgeEnvReadResponse)
async def read_edge_env(
    cluster_id: int,
    node_id: int = Query(..., description="Node ID to read edge.env from"),
    db: AsyncSession = Depends(get_db),
):
    cluster = await db.get(Cluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    node = await db.get(Node, node_id)
    if not node or node.cluster_id != cluster_id:
        raise HTTPException(status_code=404, detail="节点不存在或不属于该集群")

    try:
        result = await _ansible_service.generic_run(
            ip=node.ip, tag="edge_read_env",
            extravars={"edge_path": node.edge_path},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"节点 {node.ip} 连接失败: {str(e)}")

    if result.get("rc") != 0:
        raise HTTPException(status_code=502, detail=f"节点 {node.ip} 读取 edge.env 失败")

    content = result.get("shell_stdout") or result.get("stdout", "")
    return EdgeEnvReadResponse(node_id=node.id, node_ip=node.ip, content=content)


@router.post("/clusters/{cluster_id}/edge-env/deploy")
async def deploy_edge_env(
    cluster_id: int,
    request: EdgeEnvDeployRequest,
    db: AsyncSession = Depends(get_db),
):
    is_valid, error_msg = validate_yaml(request.content)
    if not is_valid:
        raise HTTPException(status_code=422, detail=error_msg or "YAML 格式错误")

    cluster = await db.get(Cluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    nodes = (await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))).scalars().all()
    if not nodes:
        raise HTTPException(status_code=400, detail="集群没有活跃节点")

    async def deploy_stream():
        node_results: list[dict] = []
        all_success = True

        for i, node in enumerate(nodes):
            # Emit node start
            yield f"data: {json.dumps({'type': 'node_start', 'ip': node.ip, 'index': i, 'total': len(nodes)})}\n\n"

            # Stream ansible output for this node
            try:
                async for event in _run_ansible_stream(
                    runner_method=_ansible_service,
                    ip=node.ip,
                    tag="edge_init_env",
                    extravars={"env_content": request.content, "destpath": node.edge_path},
                    job_timeout=120,
                ):
                    yield event
                node_results.append({"ip": node.ip, "status": "success"})
                yield f"data: {json.dumps({'type': 'node_done', 'ip': node.ip, 'status': 'success'})}\n\n"
            except Exception as e:
                all_success = False
                node_results.append({"ip": node.ip, "status": "failed", "error": str(e)})
                yield f"data: {json.dumps({'type': 'node_done', 'ip': node.ip, 'status': 'failed', 'error': str(e)})}\n\n"

        overall_status = "all_success" if all_success and node_results else \
                         "partial" if any(r.get("status") == "success" for r in node_results) else "all_failed"

        version = EdgeEnvVersion(
            cluster_id=cluster_id, content=request.content, status=overall_status,
            node_results=json.dumps(node_results, ensure_ascii=False),
            deployed_by=0,
        )
        db.add(version)
        await db.commit()
        await db.refresh(version)

        yield f"data: {json.dumps({'type': 'complete', 'version_id': version.id, 'status': overall_status, 'node_results': node_results})}\n\n"

    return StreamingResponse(
        deploy_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/clusters/{cluster_id}/edge-env/versions")
async def list_edge_env_versions(
    cluster_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    if not await db.get(Cluster, cluster_id):
        raise HTTPException(status_code=404, detail="集群不存在")

    versions = (await db.execute(
        select(EdgeEnvVersion).where(EdgeEnvVersion.cluster_id == cluster_id)
        .order_by(desc(EdgeEnvVersion.deployed_at))
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    total = (await db.execute(
        select(func.count()).where(EdgeEnvVersion.cluster_id == cluster_id)
    )).scalar()

    items = []
    for v in versions:
        nr = json.loads(v.node_results) if v.node_results else []
        items.append(EdgeEnvVersionListItem(
            id=v.id, status=v.status, deployed_by=str(v.deployed_by),
            deployed_at=v.deployed_at, node_count=len(nr),
            success_count=sum(1 for r in nr if r.get("status") == "success"),
        ))

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/clusters/{cluster_id}/edge-env/versions/{version_id}", response_model=EdgeEnvVersionResponse)
async def get_edge_env_version(cluster_id: int, version_id: int, db: AsyncSession = Depends(get_db)):
    version = await db.get(EdgeEnvVersion, version_id)
    if not version or version.cluster_id != cluster_id:
        raise HTTPException(status_code=404, detail="版本记录不存在")

    return EdgeEnvVersionResponse(
        id=version.id, cluster_id=version.cluster_id,
        content=version.content, previous_content=version.previous_content,
        status=version.status, deployed_by=str(version.deployed_by),
        deployed_at=version.deployed_at,
        node_results=json.loads(version.node_results) if version.node_results else [],
    )


@router.get("/clusters/{cluster_id}/edge-env/deploy/logs")
async def stream_deploy_logs(
    cluster_id: int,
    node_id: int = Query(..., description="Node ID to stream logs from"),
    task_id: str = Query("deploy", description="Task identifier"),
    db: AsyncSession = Depends(get_db),
):
    cluster = await db.get(Cluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    node = await db.get(Node, node_id)
    if not node or node.cluster_id != cluster_id:
        raise HTTPException(status_code=404, detail="节点不存在或不属于该集群")

    async def event_stream():
        async for event in _run_ansible_stream(
            runner_method=_ansible_service,
            ip=node.ip,
            tag="edge_init_env",
            extravars={
                "env_content": f"task_{task_id}",
                "destpath": node.edge_path,
            },
        ):
            yield event

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
