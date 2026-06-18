"""Install OpenResty / Edge endpoints — split from cluster_nodes.py.

Two independent routers are exported so they can be conditionally
registered based on deployment feature configuration:
  install_openresty_router  — install-openresty + cancel-install
  install_edge_router      — install-edge
"""

import asyncio
import json
import shlex
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.cluster import Node
from app.services.ansible_service import (
    AnsibleRunnerService,
    _run_ansible_stream,
    get_ssh_user,
)


# ── shared module-level helpers ────────────────────────────────────────

_ansible_service = AnsibleRunnerService()

# Registry mapping node_id -> SSH subprocess for install-openresty
# (used by cancel-install).  Shared across both routers.
_install_proc_registry: dict[int, asyncio.subprocess.Process] = {}


# ── request schemas ───────────────────────────────────────────────────

class InstallOpenrestyRequest(BaseModel):
    prefix: str
    srcpath: str = ""
    destpath: str = ""


class InstallEdgeRequest(BaseModel):
    prefix: str


# ── helper functions ──────────────────────────────────────────────────

async def _verify_node(cluster_id: int, node_id: int, db: AsyncSession) -> Node:
    result = await db.execute(
        select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id)
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")
    return node


async def _install_openresty_stream(
    ansible_svc: Any,
    node: Any,
    prefix: str,
    srcpath: str,
    destpath: str,
    request: Request | None = None,
) -> AsyncGenerator[str, None]:
    """Stream install_openresty: phase 1 = Ansible copy/decompress, phase 2 = SSH build."""
    extravars = {"prefix": prefix, "srcpath": srcpath, "destpath": destpath}
    ssh_proc: asyncio.subprocess.Process | None = None

    try:
        yield f"data: {json.dumps({'line': '阶段 1/2: 传输文件并解压...', 'percent': 0})}\n\n"
        async for event in _run_ansible_stream(ansible_svc, ip=node.ip, tag="install_openresty_copy", extravars=extravars):
            if '"rc"' in event and '"line"' not in event:
                continue
            if '"percent"' in event:
                import re
                event = re.sub(r', "percent": \d+', '', event)
            yield event

        build_dir = f"{destpath}soft/install-edge/"
        build_cmd = (
            f"source /etc/profile; "
            f"cd {build_dir} && "
            f"trap 'kill -- -\\$\\$ 2>/dev/null; exit' EXIT; "
            f"./install-edge.sh {prefix}; "
            f"wait"
        )
        ssh_user = get_ssh_user(node.ip)
        ssh_cmd_parts = [
            "ssh",
            "-i", "~/.ssh/id_rsa",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=30",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            f"{ssh_user}@{node.ip}",
            build_cmd,
        ]
        ssh_cmd_str = shlex.join(ssh_cmd_parts)
        yield f"data: {json.dumps({'line': f'$ {ssh_cmd_str}', 'percent': 40})}\n\n"
        yield f"data: {json.dumps({'line': '阶段 2/2: 执行 install-edge.sh（实时编译输出）...', 'percent': 40})}\n\n"

        try:
            proc = await asyncio.create_subprocess_exec(
                *ssh_cmd_parts,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            ssh_proc = proc
            _install_proc_registry[node.id] = proc

            while True:
                if request is not None:
                    try:
                        if await request.is_disconnected():
                            return
                    except RuntimeError:
                        pass

                try:
                    line_bytes = await asyncio.wait_for(proc.stdout.readline(), timeout=2.0)
                except asyncio.TimeoutError:
                    continue
                if not line_bytes:
                    break
                raw = line_bytes.decode("utf-8", errors="replace").rstrip()
                if raw:
                    yield f"data: {json.dumps({'line': raw})}\n\n"

            rc = await proc.wait()
            _install_proc_registry.pop(node.id, None)
            status_label = "success" if rc == 0 else "failed"
            yield f"data: {json.dumps({'line': f'✅ install-edge.sh 完成 (rc={rc})' if rc == 0 else f'❌ install-edge.sh 失败 (rc={rc})', 'percent': 100})}\n\n"
            yield f"data: {json.dumps({'rc': rc, 'status': status_label, 'percent': 100})}\n\n"
        except FileNotFoundError:
            yield f"data: {json.dumps({'line': '❌ SSH 客户端未安装，无法执行远程编译', 'percent': 100})}\n\n"
            yield f"data: {json.dumps({'rc': -1, 'status': 'failed', 'percent': 100})}\n\n"
    except GeneratorExit:
        _install_proc_registry.pop(node.id, None)
        if ssh_proc is not None and ssh_proc.returncode is None:
            try:
                ssh_proc.terminate()
                await asyncio.wait_for(ssh_proc.wait(), timeout=3.0)
            except (asyncio.TimeoutError, ProcessLookupError):
                try:
                    ssh_proc.kill()
                    await ssh_proc.wait()
                except ProcessLookupError:
                    pass
        raise

async def _ssh_run(ip: str, cmd: str, ssh_user: str = "jboss") -> tuple[int, str, str]:
    """Run a command on remote node via SSH, return (rc, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        "ssh", "-i", "~/.ssh/id_rsa",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=30",
        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
        f"{ssh_user}@{ip}", cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode or 0, stdout.decode("utf-8", errors="replace").strip(), stderr.decode("utf-8", errors="replace").strip()


# ── Router A: install-openresty + cancel-install ─────────────────────

install_openresty_router = APIRouter(prefix="/clusters", tags=["clusters-install-openresty"])


@install_openresty_router.post("/{cluster_id}/nodes/{node_id}/install-openresty")
async def install_openresty_stream(
    cluster_id: int, node_id: int,
    body: InstallOpenrestyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Install OpenResty on a target node via ansible + SSH, streaming real-time logs."""
    node = await _verify_node(cluster_id, node_id, db)
    from app.services.ansible_service import PRIVATE_DATA_DIR
    prefix = node.edge_install_path or body.prefix
    srcpath = body.srcpath or f"{PRIVATE_DATA_DIR}/soft"
    destpath = body.destpath or str(Path(prefix).parent) + "/"
    return StreamingResponse(
        _install_openresty_stream(_ansible_service, node, prefix, srcpath, destpath, request),
        media_type="text/event-stream",
    )


@install_openresty_router.post("/{cluster_id}/nodes/{node_id}/cancel-install")
async def cancel_install(
    cluster_id: int, node_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Cancel install-openresty: kill SSH process, verify remote, pkill if still alive."""
    node = await _verify_node(cluster_id, node_id, db)
    steps: list[dict] = []
    ssh_user = get_ssh_user(node.ip)

    proc = _install_proc_registry.get(node_id)

    if proc is None or proc.returncode is not None:
        steps.append({
            "command": "检查安装进程",
            "status": "skipped",
            "stdout": "未找到运行中的安装进程，可能已完成",
            "stderr": "",
        })
        return {"status": "skipped", "steps": steps}

    pid = proc.pid
    try:
        proc.terminate()
        steps.append({
            "command": f"kill -TERM {pid}",
            "status": "success",
            "stdout": f"已发送 SIGTERM 到 SSH 进程 (PID {pid})",
            "stderr": "",
        })
        await asyncio.wait_for(proc.wait(), timeout=3.0)
    except asyncio.TimeoutError:
        steps[-1]["status"] = "partial"
        steps[-1]["stdout"] += "\nSIGTERM 超时，发送 SIGKILL"
        try:
            proc.kill()
            await proc.wait()
            steps[-1]["stdout"] += "\nSIGKILL 已发送，进程已终止"
        except ProcessLookupError:
            steps[-1]["stdout"] += "\n进程已不存在"
    except ProcessLookupError:
        steps[-1] = {
            "command": f"kill -TERM {pid}",
            "status": "failed",
            "stdout": f"进程 (PID {pid}) 已不存在",
            "stderr": "",
        }

    _install_proc_registry.pop(node_id, None)

    rc, ps_stdout, ps_stderr = await _ssh_run(node.ip, "ps aux | grep install-edge.sh", ssh_user=ssh_user)
    ps_lines = [l for l in ps_stdout.split("\n") if "grep" not in l and l.strip()]
    ps_output = "\n".join(ps_lines)

    steps.append({
        "command": f"ssh {ssh_user}@{node.ip} \"ps aux | grep install-edge.sh\"",
        "status": "success",
        "stdout": ps_output or "（无输出，进程已死）",
        "stderr": ps_stderr,
    })

    if any("install-edge.sh" in l for l in ps_lines):
        rc2, pkill_stdout, pkill_stderr = await _ssh_run(node.ip, "pkill -f install-edge.sh", ssh_user=ssh_user)
        steps.append({
            "command": f"ssh {ssh_user}@{node.ip} \"pkill -f install-edge.sh\"",
            "status": "success" if rc2 == 0 else "failed",
            "stdout": pkill_stdout or "（无输出）",
            "stderr": pkill_stderr,
        })
        _, ps2_stdout, _ = await _ssh_run(node.ip, "ps aux | grep install-edge.sh", ssh_user=ssh_user)
        ps2_lines = [l for l in ps2_stdout.split("\n") if "grep" not in l and l.strip()]
        steps.append({
            "command": f"ssh {ssh_user}@{node.ip} \"ps aux | grep install-edge.sh\"（验证）",
            "status": "success",
            "stdout": "\n".join(ps2_lines) or "（无输出，进程已彻底清除）",
            "stderr": "",
        })
    else:
        steps.append({
            "command": "pkill -f install-edge.sh",
            "status": "skipped",
            "stdout": "进程已确认停止，无需强制清理",
            "stderr": "",
        })

    return {"status": "success", "steps": steps}


# ── Router B: install-edge (pure ansible, no SSH process) ────────────

install_edge_router = APIRouter(prefix="/clusters", tags=["clusters-install-edge"])


@install_edge_router.post("/{cluster_id}/nodes/{node_id}/install-edge")
async def install_edge_stream(
    cluster_id: int, node_id: int,
    body: InstallEdgeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Install Edge service on a target node via ansible, streaming real-time logs via SSE."""
    node = await _verify_node(cluster_id, node_id, db)
    prefix = node.edge_install_path or body.prefix
    extravars = {"prefix": prefix}
    return StreamingResponse(
        _run_ansible_stream(_ansible_service, ip=node.ip, tag="install_edge", extravars=extravars),
        media_type="text/event-stream",
    )
