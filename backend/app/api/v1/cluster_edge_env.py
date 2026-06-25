import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.cluster import Cluster, Node, ConfigVersion
from app.schemas.edge_env import (
    EdgeEnvReadResponse,
    EdgeEnvDeployRequest,
    NodeResultItem,
)
from app.schemas.cluster import ConfigVersionResponse, ConfigVersionListResponse
from app.services.ansible_service import AnsibleRunnerService, _run_ansible_stream
from app.services.edge_sync import create_config_version
from app.utils.yaml_validator import validate_yaml, validate_edge_env

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
    # Step 1: YAML syntax + field validation
    is_valid, error_msg = validate_edge_env(request.content)
    if not is_valid:
        raise HTTPException(status_code=422, detail=error_msg or "配置格式错误")

    cluster = await db.get(Cluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    # Step 2: resolve target nodes
    if request.node_ids:
        nodes = (await db.execute(
            select(Node).where(Node.id.in_(request.node_ids), Node.cluster_id == cluster_id)
        )).scalars().all()
        if not nodes:
            raise HTTPException(status_code=400, detail="指定的节点不存在或不属于该集群")
    else:
        nodes = (await db.execute(
            select(Node).where(Node.cluster_id == cluster_id, Node.status == 1)
        )).scalars().all()

    if not nodes:
        raise HTTPException(status_code=400, detail="没有可发布的节点")

    async def deploy_stream():
        node_results: list[dict] = []
        all_success = True

        for i, node in enumerate(nodes):
            yield f"data: {json.dumps({'type': 'node_start', 'ip': node.ip, 'index': i, 'total': len(nodes)})}\n\n"

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

        # Create version record in ConfigVersion
        config_data = {"yaml": request.content}
        new_version = await create_config_version(
            db, "edge_env", cluster_id, cluster_id, config_data, cluster
        )

        yield f"data: {json.dumps({'type': 'complete', 'version': new_version, 'status': overall_status, 'node_results': node_results})}\n\n"

    return StreamingResponse(
        deploy_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/clusters/{cluster_id}/edge-env/versions", response_model=ConfigVersionListResponse)
async def list_edge_env_versions(
    cluster_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    cluster = await db.get(Cluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="集群不存在")

    versions = (await db.execute(
        select(ConfigVersion)
        .where(ConfigVersion.resource_type == "edge_env", ConfigVersion.resource_id == cluster_id)
        .order_by(desc(ConfigVersion.version))
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    total = (await db.execute(
        select(func.count()).where(
            ConfigVersion.resource_type == "edge_env", ConfigVersion.resource_id == cluster_id
        )
    )).scalar()

    return ConfigVersionListResponse(
        total=total or 0,
        items=[ConfigVersionResponse.model_validate(v) for v in versions],
        current_version=cluster.current_version,
    )


@router.get("/clusters/{cluster_id}/edge-env/versions/{version_id}", response_model=ConfigVersionResponse)
async def get_edge_env_version(cluster_id: int, version_id: int, db: AsyncSession = Depends(get_db)):
    version = await db.get(ConfigVersion, version_id)
    if not version or version.resource_type != "edge_env" or version.resource_id != cluster_id:
        raise HTTPException(status_code=404, detail="版本记录不存在")

    return ConfigVersionResponse.model_validate(version)


@router.get("/clusters/{cluster_id}/edge-env/read-stream")
async def read_edge_env_stream(
    cluster_id: int,
    node_id: int = Query(..., description="Node ID to read edge.env from"),
    db: AsyncSession = Depends(get_db),
):
    """SSE stream: read edge.env from a node, showing real-time ansible output."""
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
            tag="edge_read_env",
            extravars={"edge_path": node.edge_path},
        ):
            yield event

        try:
            result = await _ansible_service.generic_run(
                ip=node.ip, tag="edge_read_env",
                extravars={"edge_path": node.edge_path},
            )
            content = result.get("shell_stdout") or result.get("stdout", "")
            if result.get("rc") == 0:
                yield f"data: {json.dumps({'type': 'content', 'content': content, 'percent': 100})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'message': '读取 edge.env 失败', 'percent': 100})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'percent': 100})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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
