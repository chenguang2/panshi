import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.config import MAX_PAGE_SIZE
from app.models.cluster import Cluster, Node, ConfigVersion
from app.schemas.edge_env import (
    EdgeEnvReadResponse,
    EdgeEnvDeployRequest,
)
from app.schemas.cluster import ConfigVersionResponse, ConfigVersionListResponse
from app.services.ansible_service import AnsibleRunnerService, _run_ansible_stream, translate_ansible_error
from app.services import relay_registry
from app.services.edge_sync import create_config_version
from app.utils.yaml_validator import validate_yaml, validate_edge_env

logger = logging.getLogger(__name__)

# reload 宽松判定（决策点 C）：playbook 输出 EDGE_RELOAD_WARNING 标记行时，
# 节点仍记 success 但附本 warning 文案（#21 输出标记扫描范式）。
_RELOAD_WARNING_TEXT = "配置已写入且 init 通过，reload 异常——变更可能未完全生效，请检查节点日志"

from app.core.deps import require_permission

router = APIRouter(tags=["edge-env"], dependencies=[Depends(require_permission('edge_env'))])
_ansible_service = AnsibleRunnerService()


def _node_route_fields(ip: str) -> dict:
    """节点执行路径字段（SSH 腿，与 HTTP 腿 route 契约对齐）。

    与 ansible 注入同源（relay_registry.ssh_jump_for_ip），调用方须在发起
    ansible 之前取一次。经中继时附 relay_via=跳板主机字符串，直连不含该键；
    ssh_jump_for_ip 自带"跳板即自身"自跳守卫（返回 None=直连）。
    """
    jump = relay_registry.ssh_jump_for_ip(ip)
    if jump:
        return {"route": "relay", "relay_via": jump}
    return {"route": "direct"}


@router.get("/clusters/{cluster_id}/edge-env", response_model=EdgeEnvReadResponse,
            response_model_exclude_none=True)
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

    # 节点执行路径：在发起 ansible 之前取一次（与部署同机时）。
    route_fields = _node_route_fields(node.ip)

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
    return EdgeEnvReadResponse(node_id=node.id, node_ip=node.ip, content=content, **route_fields)


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
        new_version: int | None = None  # 首个节点成功后立即创建（Q3：SSE 中断时「版本存在 ⟺ 至少一节点成功」）
        config_data = {"yaml": request.content}

        for i, node in enumerate(nodes):
            # 节点执行路径（与 HTTP 腿 route 契约对齐）：SSH 腿必须按跳板决策自行
            # 标注，且与 ansible 注入同源同机时（在本节点执行前取一次），不在结果
            # 回填时再查。
            route_fields = _node_route_fields(node.ip)

            yield f"data: {json.dumps({'type': 'node_start', 'ip': node.ip, 'index': i, 'total': len(nodes), **route_fields})}\n\n"

            try:
                node_rc = -1
                ansible_stdout = ""
                async for event in _run_ansible_stream(
                    runner_method=_ansible_service,
                    ip=node.ip,
                    tag="edge_init_env",
                    extravars={"env_content": request.content, "destpath": node.edge_path},
                    job_timeout=120,
                ):
                    yield event
                    # Capture the final rc event to determine node success
                    try:
                        ev = json.loads(event.removeprefix("data: ").removesuffix("\n\n"))
                        if ev.get("line"):
                            ansible_stdout += ev["line"] + "\n"
                        if "rc" in ev:
                            node_rc = ev.get("rc", -1)
                    except (json.JSONDecodeError, TypeError):
                        pass

                # 防假成功（镜像 edge_read_env / node_task_service 的 Bug 3 防护）：
                # ansible rc==0 但 playbook 未实际执行目标主机（节点不在清单 → "no hosts
                # matched"）时仍会以 rc=0 退出，必须判为失败并给出可读错误。
                if node_rc == 0 and (
                    "no hosts matched" in ansible_stdout.lower()
                    or "could not match supplied host pattern" in ansible_stdout.lower()
                ):
                    node_rc = -1
                    err = translate_ansible_error(ansible_stdout, node.ip) or f"节点 {node.ip} 不在 Ansible 主机清单中"
                    all_success = False
                    node_results.append({"ip": node.ip, "status": "failed", "error": err, **route_fields})
                    yield f"data: {json.dumps({'type': 'node_done', 'ip': node.ip, 'status': 'failed', 'error': err, **route_fields})}\n\n"
                    continue

                if node_rc == 0:
                    if new_version is None:
                        new_version = await create_config_version(
                            db, "edge_env", cluster_id, cluster_id, config_data, cluster
                        )
                        await db.commit()  # 版本先落库（Q3），再继续后续节点
                    result_entry = {"ip": node.ip, "status": "success", **route_fields}
                    if "EDGE_RELOAD_WARNING" in ansible_stdout:
                        result_entry["warning"] = _RELOAD_WARNING_TEXT
                    node_results.append(result_entry)
                    done_payload = {"type": 'node_done', "ip": node.ip, "status": "success", **route_fields}
                    if "warning" in result_entry:
                        done_payload["warning"] = result_entry["warning"]
                    yield f"data: {json.dumps(done_payload)}\n\n"
                else:
                    all_success = False
                    err = translate_ansible_error(ansible_stdout, node.ip) or f"发布失败（ansible rc={node_rc}），详情见下方日志"
                    node_results.append({"ip": node.ip, "status": "failed", "error": err, **route_fields})
                    yield f"data: {json.dumps({'type': 'node_done', 'ip': node.ip, 'status': 'failed', 'error': err, **route_fields})}\n\n"
            except Exception as e:
                all_success = False
                node_results.append({"ip": node.ip, "status": "failed", "error": str(e), **route_fields})
                yield f"data: {json.dumps({'type': 'node_done', 'ip': node.ip, 'status': 'failed', 'error': str(e), **route_fields})}\n\n"

        overall_status = "all_success" if all_success and node_results else \
                         "partial" if any(r.get("status") == "success" for r in node_results) else "all_failed"

        # Create version record in ConfigVersion（已前移至首个节点成功时；all_failed 不建版本）
        complete_payload: dict = {"type": "complete", "status": overall_status, "node_results": node_results}
        if new_version is not None:
            complete_payload["version"] = new_version
        yield f"data: {json.dumps(complete_payload)}\n\n"

    await db.commit()  # 落审计骨架 + 释放写锁（#29：流内 ansible 期间不再持事务）
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
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
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

    # 节点执行路径：在发起 ansible 之前取一次（与部署同机时）。
    route_fields = _node_route_fields(node.ip)

    async def event_stream():
        ansible_stdout = ""
        async for event in _run_ansible_stream(
            runner_method=_ansible_service,
            ip=node.ip,
            tag="edge_read_env",
            extravars={"edge_path": node.edge_path},
        ):
            # Capture the raw ansible output for error analysis
            try:
                parsed = json.loads(event[6:].strip())
                if parsed.get("line"):
                    ansible_stdout += parsed["line"] + "\n"
            except (json.JSONDecodeError, KeyError, IndexError):
                pass
            yield event

        try:
            result = await _ansible_service.generic_run(
                ip=node.ip, tag="edge_read_env",
                extravars={"edge_path": node.edge_path},
            )
            content = result.get("shell_stdout") or result.get("stdout", "")
            # Ansible may return rc=0 but still fail (e.g. "no hosts matched")
            if result.get("rc") == 0 and "no hosts matched" not in content.lower():
                yield f"data: {json.dumps({'type': 'content', 'content': content, 'percent': 100, **route_fields})}\n\n"
            else:
                # Friendly error message（与部署流单源：共享 translate_ansible_error）
                err_msg = translate_ansible_error(ansible_stdout, node.ip) or "读取 edge.env 失败"
                yield f"data: {json.dumps({'type': 'error', 'message': err_msg, 'percent': 100, **route_fields})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'percent': 100, **route_fields})}\n\n"

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
