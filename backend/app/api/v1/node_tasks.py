"""Node operation task center API.

Persistent async tasks for node operations (install/start/stop/...).
Dual-track: existing per-node SSE endpoints remain unchanged; this router
adds the task-based channel with a global task center view.
"""

import json
import os
import queue as _queue
import uuid
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.node_task import NodeTask, NodeTaskItem
from app.services.node_task_service import get_node_task_service

from app.core.deps import require_permission

router = APIRouter(prefix="/clusters", tags=["node-tasks"], dependencies=[Depends(require_permission('clusters'))])

# Global task center router (cross-cluster).
global_router = APIRouter(prefix="/node-tasks", tags=["node-tasks"], dependencies=[Depends(require_permission('task_center'))])


# ── Script upload helpers ──────────────────────────────────────────────

def _detect_and_convert_encoding(raw_bytes: bytes) -> str:
    """Detect encoding and convert to UTF-8. Raises ValueError on failure."""
    import charset_normalizer
    result = charset_normalizer.from_bytes(raw_bytes).best()
    if result is None:
        raise ValueError("无法检测文件编码，请确保文件为 UTF-8 编码")
    encoding = result.encoding
    if encoding is None:
        raise ValueError("无法检测文件编码")
    try:
        return raw_bytes.decode(encoding)
    except (UnicodeDecodeError, LookupError) as e:
        raise ValueError(f"文件编码转换失败: {e}")


@global_router.post("/upload-script")
async def upload_script(file: UploadFile = File(...)):
    """Upload a script file for later execution on nodes.

    Returns upload_id (UUID) and original filename.
    """
    from app.config.script_upload import (
        SCRIPT_MAX_SIZE_BYTES, SCRIPT_ALLOWED_EXTENSIONS,
        get_upload_temp_path, TEMP_DIR,
    )

    # Validate filename
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")

    # Validate extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SCRIPT_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}，仅支持 {', '.join(SCRIPT_ALLOWED_EXTENSIONS)}",
        )

    # Read file content
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="文件为空")

    # Validate size
    if len(content) > SCRIPT_MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过限制: {len(content)} bytes（最大 {SCRIPT_MAX_SIZE_BYTES} bytes）",
        )

    # Detect encoding and convert to UTF-8
    try:
        utf8_content = _detect_and_convert_encoding(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Generate UUID and save
    upload_id = str(uuid.uuid4())
    temp_path = get_upload_temp_path(upload_id)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    temp_path.write_text(utf8_content, encoding="utf-8")

    # Store metadata (filename) alongside the file
    meta_path = temp_path.with_suffix(".meta")
    meta_path.write_text(file.filename, encoding="utf-8")

    return {
        "upload_id": upload_id,
        "filename": file.filename,
        "size": len(content),
    }


@global_router.get("/script-preview/{upload_id}")
async def preview_script(upload_id: str):
    """Preview an uploaded script file's content."""
    from app.config.script_upload import get_upload_temp_path

    temp_path = get_upload_temp_path(upload_id)
    if not temp_path.exists():
        raise HTTPException(status_code=404, detail="脚本文件不存在或已过期")

    content = temp_path.read_text(encoding="utf-8")
    # Read original filename from meta file
    meta_path = temp_path.with_suffix(".meta")
    filename = meta_path.read_text(encoding="utf-8") if meta_path.exists() else "script.sh"
    return {
        "upload_id": upload_id,
        "content": content,
        "filename": filename,
    }


@global_router.get("/uploaded-scripts")
async def list_uploaded_scripts():
    """List all uploaded script files in the temp directory."""
    from app.config.script_upload import TEMP_DIR

    if not TEMP_DIR.exists():
        return []

    results = []
    for p in sorted(TEMP_DIR.iterdir()):
        if p.suffix == ".meta":
            continue
        if not p.is_file():
            continue
        # Read filename from meta file
        meta_path = p.with_suffix(".meta")
        filename = meta_path.read_text(encoding="utf-8") if meta_path.exists() else p.name
        results.append({
            "upload_id": p.stem,
            "filename": filename,
            "size": p.stat().st_size,
        })
    return results


@global_router.delete("/uploaded-scripts/{upload_id}")
async def delete_uploaded_script(upload_id: str):
    """Delete an uploaded script file."""
    from app.config.script_upload import get_upload_temp_path

    temp_path = get_upload_temp_path(upload_id)
    if not temp_path.exists():
        raise HTTPException(status_code=404, detail="脚本文件不存在")

    temp_path.unlink(missing_ok=True)
    meta_path = temp_path.with_suffix(".meta")
    meta_path.unlink(missing_ok=True)

    return {"detail": "脚本文件已删除"}


# ── Distribute file upload (byte-perfect, no encoding) ──────────────

@global_router.post("/upload-distribute-file")
async def upload_distribute_file(file: UploadFile = File(...)):
    """Upload a file for distribution to nodes.

    No encoding detection — stores raw bytes byte-perfectly.
    """
    from app.config.script_upload import (
        DISTRIBUTE_MAX_SIZE_BYTES,
        get_distribute_upload_temp_path, TEMP_DIR,
    )

    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="文件为空")

    if len(content) > DISTRIBUTE_MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过限制: {len(content)} bytes（最大 {DISTRIBUTE_MAX_SIZE_BYTES} bytes）",
        )

    upload_id = str(uuid.uuid4())
    temp_path = get_distribute_upload_temp_path(upload_id)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    temp_path.write_bytes(content)

    # Store metadata alongside the file
    meta_path = temp_path.with_suffix(".meta")
    meta_path.write_text(file.filename, encoding="utf-8")

    return {
        "upload_id": upload_id,
        "filename": file.filename,
        "size": len(content),
    }


# ── Distribute file preview ─────────────────────────────────────────

@global_router.get("/distribute-preview/{upload_id}")
async def preview_distribute_file(upload_id: str):
    """Preview an uploaded distribute file's content."""
    from app.config.script_upload import get_distribute_upload_temp_path

    temp_path = get_distribute_upload_temp_path(upload_id)
    if not temp_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在或已过期")

    meta_path = temp_path.with_suffix(".meta")
    filename = meta_path.read_text(encoding="utf-8") if meta_path.exists() else "unknown"
    content_bytes = temp_path.read_bytes()

    # Try UTF-8 decode for preview
    try:
        content = content_bytes.decode("utf-8")
        preview_available = True
    except (UnicodeDecodeError, ValueError):
        content = None
        preview_available = False

    return {
        "upload_id": upload_id,
        "filename": filename,
        "content": content,
        "preview_available": preview_available,
    }


TaskType = Literal[
    "install_openresty",
    "install_edge",
    "associate_new_openresty",
    "edge_pack_add",
    "edge_pack_rebase",
    "start",
    "stop",
    "reload",
    "check",
    "statistic",
    "edge_env_deploy",
    "software_check",
    "cmd_exec",
    "distribute_file",
]


class CreateTaskRequest(BaseModel):
    task_type: TaskType
    node_ids: list[int] = Field(min_length=1)
    params: dict = Field(default_factory=dict)


class RetryTaskRequest(BaseModel):
    node_ids: Optional[list[int]] = None


class BatchDeleteRequest(BaseModel):
    task_ids: list[int] = Field(min_length=1)


# ── task_type -> (ansible tag or executor hook, required params) ──
_TASK_TAG: dict[str, str] = {
    "install_edge": "install_edge",
    "associate_new_openresty": "upgrade_openresty",
    "edge_pack_add": "edge_pack_add",
    "edge_pack_rebase": "edge_pack_rebase",
    "edge_env_deploy": "edge_init_env",
}


def _to_item_dict(item: NodeTaskItem) -> dict:
    return {
        "id": item.id,
        "node_id": item.node_id,
        "ip": item.ip,
        "node_name": item.node_name,
        "status": item.status,
        "rc": item.rc,
        "logs": item.get_logs(),
        "stdout": item.stdout or item.stdout_tail,
        "stderr": item.stderr,
        "command": item.command,
        "log_file": item.log_file,
        "log_line_count": item.log_line_count,
        "started_at": item.started_at.isoformat() if item.started_at else None,
        "finished_at": item.finished_at.isoformat() if item.finished_at else None,
    }


def _to_task_dict(task: NodeTask, items: list[NodeTaskItem] | None = None) -> dict:
    data = {
        "id": task.id,
        "cluster_id": task.cluster_id,
        "task_type": task.task_type,
        "status": task.status,
        "params": task.get_params(),
        "total_nodes": task.total_nodes,
        "success_nodes": task.success_nodes,
        "failed_nodes": task.failed_nodes,
        "cancelled_nodes": task.cancelled_nodes,
        "created_by": task.created_by,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
    }
    if items is not None:
        data["items"] = [_to_item_dict(i) for i in items]
    return data


@router.post("/{cluster_id}/node-tasks", status_code=201)
async def create_node_task(
    cluster_id: int,
    body: CreateTaskRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a persistent node-operation task."""
    from app.models.cluster import Node

    # cmd_exec: mutual exclusion of cmd / script_file / script_content (before node check)
    if body.task_type == "cmd_exec":
        has_cmd = bool(body.params.get("cmd", "").strip())
        has_script_file = bool(body.params.get("script_file"))
        has_script_content = bool(body.params.get("script_content"))
        script_count = sum([has_cmd, has_script_file, has_script_content])
        if script_count > 1:
            raise HTTPException(status_code=400, detail="cmd、script_file、script_content 互斥，只能指定一个")
        if script_count == 0:
            raise HTTPException(status_code=400, detail="cmd_exec 必须指定 cmd、script_file 或 script_content")

    # distribute_file: validate destpath, auto-append trailing /
    distribute_upload_id = None
    if body.task_type == "distribute_file":
        destpath = body.params.get("destpath", "")
        if not destpath or not destpath.strip():
            raise HTTPException(status_code=400, detail="distribute_file 必须指定 destpath（目标目录路径）")
        if not destpath.endswith("/"):
            destpath = destpath + "/"
            body.params["destpath"] = destpath
        srcpath = body.params.get("srcpath", "")
        if not srcpath or not srcpath.strip():
            raise HTTPException(status_code=400, detail="distribute_file 必须指定 srcpath")
        # Extract upload_id from srcpath (format: "temp/{upload_id}")
        distribute_upload_id = srcpath.split("/")[-1]

    nodes = (
        await db.execute(
            select(Node).where(Node.cluster_id == cluster_id, Node.id.in_(body.node_ids))
        )
    ).scalars().all()
    found_ids = {n.id for n in nodes}
    missing = [nid for nid in body.node_ids if nid not in found_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"节点不存在: {missing}")

    snapshots = {n.id: (n.ip, n.edge_path) for n in nodes}
    svc = get_node_task_service()

    # Migrate script_file from temp to task-scripts/{task_id}/
    script_upload_id = body.params.get("script_file")
    try:
        task = await svc.create_task(
            db=db,
            cluster_id=cluster_id,
            task_type=body.task_type,
            node_ids=body.node_ids,
            params=body.params,
            node_snapshots=snapshots,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Migrate script file after task creation (we need task.id) — only for script_file mode
    if script_upload_id:
        from app.config.script_upload import get_upload_temp_path, TASK_SCRIPTS_DIR
        temp_path = get_upload_temp_path(script_upload_id)
        if not temp_path.exists():
            raise HTTPException(status_code=400, detail="脚本文件不存在或已过期")
        task_dir = TASK_SCRIPTS_DIR / str(task.id)
        task_dir.mkdir(parents=True, exist_ok=True)
        import shutil
        shutil.move(str(temp_path), str(task_dir / f"{script_upload_id}.sh"))
        meta_path = temp_path.with_suffix(".meta")
        if meta_path.exists():
            meta_path.unlink()

    # Migrate distribute_file after task creation — only for distribute_file mode
    if distribute_upload_id:
        from app.config.script_upload import get_distribute_upload_temp_path, TASK_SCRIPTS_DIR
        temp_path = get_distribute_upload_temp_path(distribute_upload_id)
        if not temp_path.exists():
            raise HTTPException(status_code=400, detail="分发文件不存在或已过期")
        task_dir = TASK_SCRIPTS_DIR / str(task.id)
        task_dir.mkdir(parents=True, exist_ok=True)
        import shutil
        shutil.move(str(temp_path), str(task_dir / distribute_upload_id))
        # Move meta file too
        meta_path = temp_path.with_suffix(".meta")
        if meta_path.exists():
            shutil.move(str(meta_path), str(task_dir / f"{distribute_upload_id}.meta"))

    return _to_task_dict(task)


@router.get("/{cluster_id}/node-tasks")
async def list_cluster_tasks(
    cluster_id: int,
    status: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(NodeTask).where(NodeTask.cluster_id == cluster_id)
    if status:
        stmt = stmt.where(NodeTask.status == status)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    rows = (
        await db.execute(
            stmt.order_by(NodeTask.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return {"total": total, "items": [_to_task_dict(t) for t in rows]}


@global_router.get("")
async def list_all_tasks(
    status: Optional[str] = Query(default=None),
    task_type: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(NodeTask)
    if status:
        stmt = stmt.where(NodeTask.status == status)
    if task_type:
        stmt = stmt.where(NodeTask.task_type == task_type)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    rows = (
        await db.execute(
            stmt.order_by(NodeTask.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return {"total": total, "items": [_to_task_dict(t) for t in rows]}


@global_router.get("/{task_id}")
async def get_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(NodeTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    items = (
        await db.execute(
            select(NodeTaskItem).where(NodeTaskItem.task_id == task_id).order_by(NodeTaskItem.id)
        )
    ).scalars().all()
    return _to_task_dict(task, items)


@global_router.post("/{task_id}/cancel")
async def cancel_node_task(task_id: int):
    svc = get_node_task_service()
    await svc.cancel_task(task_id)
    return {"status": "cancelling", "task_id": task_id}


@global_router.post("/{task_id}/retry")
async def retry_node_task(
    task_id: int,
    body: RetryTaskRequest | None = None,
):
    svc = get_node_task_service()
    await svc.retry_task(task_id, node_ids=body.node_ids if body else None)
    return {"status": "retrying", "task_id": task_id}


TERMINAL_STATUSES = {"success", "failed", "partial", "cancelled"}


async def _delete_task_row(db: AsyncSession, task: NodeTask) -> None:
    """Delete a task row and its items explicitly (not relying on FK cascade,
    which is inactive on some SQLite connections) plus its log files."""
    from app.services import task_log_store

    task_id = task.id
    await db.execute(
        delete(NodeTaskItem).where(NodeTaskItem.task_id == task_id)
    )
    await db.delete(task)
    await db.commit()
    task_log_store.delete_task_logs(task_id)


@global_router.delete("/{task_id}")
async def delete_node_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Hard-delete a terminal task (cascades items + removes log files + cleans script files)."""
    task = await db.get(NodeTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status not in TERMINAL_STATUSES:
        raise HTTPException(status_code=409, detail="任务执行中，请先取消")

    # Clean up task-scripts directory if it exists
    from app.config.script_upload import TASK_SCRIPTS_DIR
    import shutil
    task_script_dir = TASK_SCRIPTS_DIR / str(task_id)
    if task_script_dir.exists():
        shutil.rmtree(task_script_dir, ignore_errors=True)

    await _delete_task_row(db, task)
    return {"deleted": [task_id]}


@global_router.post("/batch-delete")
async def batch_delete_node_tasks(
    body: BatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Hard-delete multiple terminal tasks; skip non-terminal / missing ones."""
    deleted: list[int] = []
    skipped: list[int] = []
    tasks = (
        await db.execute(select(NodeTask).where(NodeTask.id.in_(body.task_ids)))
    ).scalars().all()
    found = {t.id: t for t in tasks}
    for task_id in body.task_ids:
        task = found.get(task_id)
        if task is None or task.status not in TERMINAL_STATUSES:
            skipped.append(task_id)
            continue
        deleted.append(task_id)
    for task_id in deleted:
        await _delete_task_row(db, found[task_id])
    return {"deleted": deleted, "skipped": skipped}


@global_router.get("/{task_id}/stream")
async def stream_task_events(task_id: int):
    """SSE stream of task/node updates with real-time log lines.

    Emits a snapshot (task + node states) first, then incremental
    ``log_line`` / ``node_update`` / ``task_update`` / ``done`` events.
    """
    from fastapi.responses import StreamingResponse

    from app.core.database import AsyncSessionLocal
    from app.services import task_log_store

    svc = get_node_task_service()

    def sse(event: dict) -> str:
        return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    async def event_gen():
        q = svc.subscribe(task_id)
        try:
            async with AsyncSessionLocal() as db:
                task = await db.get(NodeTask, task_id)
                if task is None:
                    yield sse({"type": "error", "task_id": task_id})
                    return
                yield sse({
                    "type": "task_update", "task_id": task_id,
                    "status": task.status,
                    "success_nodes": task.success_nodes,
                    "failed_nodes": task.failed_nodes,
                    "cancelled_nodes": task.cancelled_nodes,
                })
                items = (
                    await db.execute(
                        select(NodeTaskItem).where(NodeTaskItem.task_id == task_id).order_by(NodeTaskItem.id)
                    )
                ).scalars().all()
                for it in items:
                    yield sse({
                        "type": "node_update", "task_id": task_id,
                        "node_id": it.node_id, "status": it.status, "rc": it.rc,
                    })
                    if it.log_file:
                        for line in task_log_store.read_log(task_id, it.node_id).splitlines():
                            yield sse({"type": "log_line", "task_id": task_id, "node_id": it.node_id, "line": line})

                terminal = {"success", "failed", "partial", "cancelled"}
                if task.status in terminal:
                    yield sse({"type": "done", "task_id": task_id})
                    return

            while True:
                try:
                    event = q.get_nowait()
                except _queue.Empty:
                    await asyncio_sleep(0.2)
                    continue
                yield sse(event)
                if event.get("type") == "done":
                    return
        finally:
            svc.unsubscribe(task_id, q)

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@global_router.get("/{task_id}/items/{node_id}/log")
async def get_task_item_log(
    task_id: int,
    node_id: int,
    tail: int = Query(default=0, ge=0),
):
    """Read a task item's full log file (or its tail). text/plain."""
    from fastapi.responses import PlainTextResponse

    from app.core.database import AsyncSessionLocal
    from app.services import task_log_store

    content = task_log_store.read_log(task_id, node_id, tail=tail or None)
    if not content:
        async with AsyncSessionLocal() as db:
            item = (
                await db.execute(
                    select(NodeTaskItem).where(
                        NodeTaskItem.task_id == task_id,
                        NodeTaskItem.node_id == node_id,
                    )
                )
            ).scalar_one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="任务节点不存在")
        content = item.stdout or item.stdout_tail or ""
    return PlainTextResponse(content)


async def asyncio_sleep(seconds: float):
    import asyncio
    await asyncio.sleep(seconds)
