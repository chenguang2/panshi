"""Node operation task center API.

Persistent async tasks for node operations (install/start/stop/...).
Dual-track: existing per-node SSE endpoints remain unchanged; this router
adds the task-based channel with a global task center view.
"""

import json
import os
import queue as _queue
import re
import uuid
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import MAX_PAGE_SIZE
from app.core.database import get_db
from app.models.cluster import Cluster
from app.models.node_task import NodeTask, NodeTaskItem
from app.models.user import User
from app.services.node_task_service import (
    RETRY_INVALID_NODES_MESSAGE,
    RETRY_NOT_TERMINAL_MESSAGE,
    TERMINAL_STATUSES,
    get_node_task_service,
)

from app.core.deps import get_current_user, require_permission

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
    from datetime import datetime

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
            # 存储形态区分类型：脚本 = {id}.sh，分发文件 = {id}（无后缀）
            "kind": "script" if p.suffix == ".sh" else "distribute",
            "uploaded_at": datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds"),
        })
    return results


@global_router.delete("/uploaded-scripts/{upload_id}")
async def delete_uploaded_script(upload_id: str):
    """Delete an uploaded script file."""
    from app.config.script_upload import get_distribute_upload_temp_path, get_upload_temp_path

    # 兼容两种存储形态：脚本 = temp/{id}.sh，分发文件 = temp/{id}（无后缀）。
    # 历史 bug：只找 .sh 路径导致分发文件删除 404（被前端 catch 静默吞掉）→ 永久泄漏。
    temp_path = get_upload_temp_path(upload_id)
    if not temp_path.exists():
        temp_path = get_distribute_upload_temp_path(upload_id)
    if not temp_path.exists():
        raise HTTPException(status_code=404, detail="脚本文件不存在")

    temp_path.unlink(missing_ok=True)
    meta_path = temp_path.with_suffix(".meta")
    meta_path.unlink(missing_ok=True)

    return {"detail": "脚本文件已删除"}


# ── Task archived files (task-scripts/{task_id}/) ────────────────────

def _read_meta_name(file_path, meta_path):
    """任务目录留档的原始文件名：优先 .meta，退化用存储名。"""
    for candidate in (meta_path, file_path.with_suffix(".meta")):
        if candidate.exists():
            try:
                return candidate.read_text(encoding="utf-8")
            except OSError:
                break
    return file_path.name


@global_router.get("/task-files")
async def list_task_files(db: AsyncSession = Depends(get_db)):
    """List archived files across task directories (task-scripts/{task_id}/)."""
    from app.config.script_upload import TASK_SCRIPTS_DIR

    results = []
    if not TASK_SCRIPTS_DIR.exists():
        return results

    task_ids: list[int] = []
    for d in sorted(
        (x for x in TASK_SCRIPTS_DIR.iterdir() if x.is_dir() and x.name.isdigit()),
        key=lambda x: int(x.name),
        reverse=True,
    ):
        for p in sorted(d.iterdir()):
            if not p.is_file() or p.name.endswith(".meta"):
                continue
            is_script = p.name.endswith(".sh")
            tid = int(d.name)
            task_ids.append(tid)
            results.append({
                "task_id": tid,
                "name": p.name,
                # 优先 .meta 里的原始文件名（脚本/分发一致）；无 meta 退化存储名
                "filename": _read_meta_name(p, Path(str(p) + ".meta")),
                "size": p.stat().st_size,
                "kind": "script" if is_script else "distribute",
            })

    # 批量查询任务元数据（task_type + created_at），一次 IO
    task_meta: dict[int, dict] = {}
    if task_ids:
        rows = (
            await db.execute(
                select(NodeTask.id, NodeTask.task_type, NodeTask.created_at).where(
                    NodeTask.id.in_(task_ids)
                )
            )
        ).all()
        task_meta = {r[0]: {"task_type": r[1], "created_at": r[2].isoformat() if r[2] else None} for r in rows}

    for item in results:
        meta = task_meta.get(item["task_id"], {})
        item["task_type"] = meta.get("task_type", "")
        item["created_at"] = meta.get("created_at")

    return results


@global_router.delete("/task-files/{task_id}/{name}")
async def delete_task_file(task_id: int, name: str):
    """Delete a task's archived source file (controller copy only).

    不影响已分发到节点上的文件，也不删除任务本身。
    """
    from app.config.script_upload import TASK_SCRIPTS_DIR

    if not name or "/" in name or "\\" in name or name in (".", ".."):
        raise HTTPException(status_code=400, detail="非法文件名")

    file_path = TASK_SCRIPTS_DIR / str(task_id) / name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")

    file_path.unlink(missing_ok=True)
    for meta_candidate in (file_path.with_suffix(".meta"), Path(str(file_path) + ".meta")):
        meta_candidate.unlink(missing_ok=True)

    return {"detail": "文件已删除"}


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
    # 留档用：将此 upload_id 对应的临时文件迁入任务目录（不参与执行逻辑）
    archive_upload_id: Optional[str] = None


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
        "failure_reason": item.failure_reason,
        "command": item.command,
        "attempt": item.attempt or 0,
        "log_file": item.log_file,
        "log_line_count": item.log_line_count,
        "started_at": item.started_at.isoformat() if item.started_at else None,
        "finished_at": item.finished_at.isoformat() if item.finished_at else None,
    }


def _failure_label(reason: str) -> str:
    """把一条完整归因文案压成任务级摘要用的短标签。

    去掉具体 IP 与「，请检查…/调大…」建议尾句，只留可聚合的短句：
    「节点 10.0.0.1 无法连接，请检查网络与 SSH 服务（22 端口）」→「节点无法连接」；
    「节点 10.0.0.1 执行异常：xxx」→「节点执行异常」（异常文本各不相同，必须合并计数，
    否则同一原因会被拆成 N 条各 1 台的摘要）。
    """
    rest = re.sub(r"^节点\s+\S+", "", reason.strip())
    rest = re.split(r"[，：]", rest, maxsplit=1)[0].strip()
    if not rest:
        return "节点执行失败"
    # 取消是**任务级**结果，不是节点级故障：归因原文「任务已被取消，执行已中断」
    # 若套上「{n} 台节点」前缀会读成「1 台节点任务已被取消」（同句两个「任务」）。
    # 直接给「已取消」，摘要即为「1 台已取消」。
    if rest.startswith("任务已被取消"):
        return "已取消"
    # 中文短句直接连写（「节点无法连接」）；英文/数字开头补空格（「节点 SSH 认证失败」）
    return f"节点 {rest}" if rest[0].isascii() else f"节点{rest}"


def _summarize_reasons(reasons) -> str | None:
    """按短标签聚合失败原因计数 → 「3 台节点不在 Ansible 主机清单中；1 台节点 SSH 认证失败」。"""
    counts: dict[str, int] = {}
    for reason in reasons:
        if not reason or not str(reason).strip():
            continue
        label = _failure_label(str(reason))
        counts[label] = counts.get(label, 0) + 1
    if not counts:
        return None
    return "；".join(f"{n} 台{label}" for label, n in counts.items())


def _summarize_failures(items) -> str | None:
    """任务级失败摘要（列表「结果」单元格第二行）：无可聚合原因时返回 None。"""
    return _summarize_reasons(getattr(i, "failure_reason", None) for i in items)


async def _failure_summary_map(db: AsyncSession, task_ids: list[int]) -> dict[int, str | None]:
    """一次查询取本页任务的子项失败原因，在内存里聚合（禁止逐任务 N+1）。"""
    if not task_ids:
        return {}
    rows = (
        await db.execute(
            select(NodeTaskItem.task_id, NodeTaskItem.failure_reason).where(
                NodeTaskItem.task_id.in_(task_ids)
            )
        )
    ).all()
    grouped: dict[int, list[str | None]] = {tid: [] for tid in task_ids}
    for task_id, reason in rows:
        grouped.setdefault(task_id, []).append(reason)
    return {tid: _summarize_reasons(reasons) for tid, reasons in grouped.items()}


def _cancel_requested_at_iso(task: NodeTask) -> str | None:
    """取消请求时间（iso）。任务对象缺该属性时视为未请求（测试伪对象兼容）。"""
    requested_at = getattr(task, "cancel_requested_at", None)
    return requested_at.isoformat() if requested_at else None


def _cluster_display_name(display_name: str | None, name: str | None) -> str | None:
    """集群展示名：display_name 优先，回退标识 name；集群已删除/不存在 → None。

    任务中心的 cluster_id 是纯 int 无外键（任务历史跨集群存活，见模型注释），
    因此 LEFT JOIN 可能整行为空——前端此时显示占位符。
    """
    return display_name or name or None


def _to_task_dict(
    task: NodeTask,
    items: list[NodeTaskItem] | None = None,
    failure_summary: str | None = None,
    cluster_name: str | None = None,
    created_by_name: str | None = None,
) -> dict:
    data = {
        "id": task.id,
        "cluster_id": task.cluster_id,
        # 跨集群列表无法从 cluster_id 读出集群名（D7）：由调用方 JOIN 后传入，
        # 集群已删除时为 None，前端显示占位。
        "cluster_name": cluster_name,
        "task_type": task.task_type,
        "status": task.status,
        "params": task.get_params(),
        "total_nodes": task.total_nodes,
        "success_nodes": task.success_nodes,
        "failed_nodes": task.failed_nodes,
        "skipped_nodes": task.skipped_nodes,
        "cancelled_nodes": task.cancelled_nodes,
        "created_by": task.created_by,
        # 发起人用户名（D7）：历史任务 created_by 为 NULL → None。
        "created_by_name": created_by_name,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
        # 取消请求（D3）：getattr 兜底——部分测试用 SimpleNamespace 伪造任务对象，
        # 缺列时按「未请求取消」处理。
        "cancel_requested_at": (
            _cancel_requested_at_iso(task)
        ),
        "cancel_requested": _cancel_requested_at_iso(task) is not None,
    }
    if items is not None:
        data["items"] = [_to_item_dict(i) for i in items]
        # 详情端点带 items：就地聚合；调用方已算好时以传入值为准
        if failure_summary is None:
            failure_summary = _summarize_failures(items)
        data["failure_summary"] = failure_summary
    elif failure_summary is not None:
        data["failure_summary"] = failure_summary
    return data


# ── 列表过滤（D7：关键字 / 集群 / 时间范围）────────────────────────────

_TIME_RANGE_ERROR = "时间范围格式不正确，请使用 YYYY-MM-DD"


def _parse_created_bound(raw: str | None, *, upper: bool) -> datetime | None:
    """解析 created_from / created_to（ISO 日期或日期时间）。

    - 纯日期（``2026-11-01``）：from 取当日 00:00:00，to 取当日 23:59:59.999999，
      否则「今天」这个过滤条件会把当天新建的任务全部漏掉（最常见的使用场景）。
    - 日期时间（``2026-11-01T08:00:00``）按原值比较；带时区的输入折算成 naive UTC，
      与库里的 ``datetime.utcnow`` 存储口径对齐。
    - 解析失败 → 400 中文错误（不用 422，保持与其它业务校验一致的语义）。
    """
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        if len(text) == 10:  # YYYY-MM-DD
            day = date.fromisoformat(text)
            return datetime.combine(day, time.max if upper else time.min)
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise HTTPException(status_code=400, detail=_TIME_RANGE_ERROR)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _keyword_filter(q: str):
    """关键字过滤条件：任务号（纯数字）| 子项 IP | params 原文（命令/路径等）。

    params 存的是 json.dumps 原文（命令通常小写），IP 也可能被大写输入查询，
    故两边统一 lower() 比较——SQLite 的 LIKE 不区分大小写，但 PG 区分，
    用 lower() 后两个后端行为一致。
    """
    needle = f"%{q.strip().lower()}%"
    ip_subq = select(NodeTaskItem.task_id).where(
        func.lower(NodeTaskItem.ip).like(needle)
    )
    conditions = [
        NodeTask.id.in_(ip_subq),
        func.lower(func.coalesce(NodeTask.params, "")).like(needle),
    ]
    stripped = q.strip()
    if stripped.isdigit() and len(stripped) <= 15:
        # 纯数字同时按任务号精确匹配（「同时」= 与 IP/命令条件取或）。
        # 长度上限：超长数字串按任务号绑定会在严格类型后端溢出（500），
        # 此时退化为普通字符串匹配即可。
        conditions.append(NodeTask.id == int(stripped))
    return or_(*conditions)


def _task_list_stmt(
    *,
    cluster_id: int | None = None,
    status: str | None = None,
    task_type: str | None = None,
    q: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
):
    """列表查询：一次 LEFT JOIN 取集群名与发起人名（禁止逐行补查，D7）。

    两次 outerjoin 是必需的：``NodeTask.cluster_id`` 无外键且任务历史跨集群存活
    （集群删除后 delete 不级联），``created_by`` 历史任务为 NULL——内连接会把
    这些行整条丢掉。
    """
    stmt = (
        select(NodeTask, Cluster.display_name, Cluster.name, User.username)
        .outerjoin(Cluster, Cluster.id == NodeTask.cluster_id)
        .outerjoin(User, User.id == NodeTask.created_by)
    )
    if cluster_id is not None:
        stmt = stmt.where(NodeTask.cluster_id == cluster_id)
    if status:
        stmt = stmt.where(NodeTask.status == status)
    if task_type:
        stmt = stmt.where(NodeTask.task_type == task_type)
    if q and q.strip():
        stmt = stmt.where(_keyword_filter(q))
    if created_from is not None:
        stmt = stmt.where(NodeTask.created_at >= created_from)
    if created_to is not None:
        stmt = stmt.where(NodeTask.created_at <= created_to)
    return stmt


async def _list_task_page(db: AsyncSession, stmt, page: int, page_size: int) -> dict:
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    rows = (
        await db.execute(
            stmt.order_by(NodeTask.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    tasks = [row[0] for row in rows]
    summaries = await _failure_summary_map(db, [t.id for t in tasks])
    return {
        "total": total,
        "items": [
            _to_task_dict(
                row[0],
                failure_summary=summaries.get(row[0].id),
                cluster_name=_cluster_display_name(row[1], row[2]),
                created_by_name=row[3],
            )
            for row in rows
        ],
    }


@router.post("/{cluster_id}/node-tasks", status_code=201)
async def create_node_task(
    cluster_id: int,
    body: CreateTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
        # srcfilename（原始文件名）将作为节点上的落地名：只允许纯文件名，
        # 双层校验之 API 层（service 层 _execute_distribute_batch 还会取 basename 兜底）
        srcfilename = str(body.params.get("srcfilename") or "")
        if srcfilename and ("/" in srcfilename or "\\" in srcfilename):
            raise HTTPException(
                status_code=400,
                detail="srcfilename 只能是纯文件名，不能包含路径分隔符",
            )

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
            # D7：记录发起人（此前恒为 NULL，界面无法显示「谁发起的」）
            created_by=current_user.id,
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
        # 保留 meta（原始文件名），任务留档列表需要展示
        meta_path = temp_path.with_suffix(".meta")
        if meta_path.exists():
            shutil.move(str(meta_path), str(task_dir / f"{script_upload_id}.meta"))

    # archive_upload_id: 将上传文件迁入任务目录仅供留档（不参与执行）
    if body.archive_upload_id:
        from app.config.script_upload import get_upload_temp_path, TASK_SCRIPTS_DIR
        temp_path = get_upload_temp_path(body.archive_upload_id)
        if temp_path.exists():
            import shutil
            task_dir = TASK_SCRIPTS_DIR / str(task.id)
            task_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(temp_path), str(task_dir / f"{body.archive_upload_id}.sh"))
            meta_path = temp_path.with_suffix(".meta")
            if meta_path.exists():
                shutil.move(str(meta_path), str(task_dir / f"{body.archive_upload_id}.meta"))

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
    q: Optional[str] = Query(default=None, description="关键字：任务号 / 节点 IP / 命令等 params 原文"),
    created_from: Optional[str] = Query(default=None, description="起始时间（YYYY-MM-DD 或 ISO 日期时间，含当日 00:00）"),
    created_to: Optional[str] = Query(default=None, description="结束时间（YYYY-MM-DD 或 ISO 日期时间，日期型含当日 23:59:59）"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
):
    stmt = _task_list_stmt(
        cluster_id=cluster_id,
        status=status,
        q=q,
        created_from=_parse_created_bound(created_from, upper=False),
        created_to=_parse_created_bound(created_to, upper=True),
    )
    return await _list_task_page(db, stmt, page, page_size)


@global_router.get("")
async def list_all_tasks(
    status: Optional[str] = Query(default=None),
    task_type: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, description="关键字：任务号 / 节点 IP / 命令等 params 原文"),
    cluster_id: Optional[int] = Query(default=None, description="按所属集群过滤"),
    created_from: Optional[str] = Query(default=None, description="起始时间（YYYY-MM-DD 或 ISO 日期时间，含当日 00:00）"),
    created_to: Optional[str] = Query(default=None, description="结束时间（YYYY-MM-DD 或 ISO 日期时间，日期型含当日 23:59:59）"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
):
    stmt = _task_list_stmt(
        cluster_id=cluster_id,
        status=status,
        task_type=task_type,
        q=q,
        created_from=_parse_created_bound(created_from, upper=False),
        created_to=_parse_created_bound(created_to, upper=True),
    )
    return await _list_task_page(db, stmt, page, page_size)


@global_router.get("/{task_id}")
async def get_task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            _task_list_stmt().where(NodeTask.id == task_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    task = row[0]
    items = (
        await db.execute(
            select(NodeTaskItem).where(NodeTaskItem.task_id == task_id).order_by(NodeTaskItem.id)
        )
    ).scalars().all()
    return _to_task_dict(
        task,
        items,
        cluster_name=_cluster_display_name(row[1], row[2]),
        created_by_name=row[3],
    )


@global_router.post("/{task_id}/cancel")
async def cancel_node_task(task_id: int, db: AsyncSession = Depends(get_db)):
    svc = get_node_task_service()
    # db 贯穿：cancel 需要把 cancel_requested_at 落库（刷新页面后仍显示「取消中」），
    # 且必须复用请求会话（审计骨架已在其上 flush，AGENTS #29）。
    await svc.cancel_task(task_id, db=db)
    return {"status": "cancelling", "task_id": task_id, "cancel_requested": True}


@global_router.post("/{task_id}/retry")
async def retry_node_task(
    task_id: int,
    body: RetryTaskRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """重试终态任务（D6）：非终态 409，无效 node_ids 400（api + service 双层校验）。"""
    task = await db.get(NodeTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status not in TERMINAL_STATUSES:
        # 非终态：再起一个执行体会覆盖 self._running，两个执行体写同一批子项
        raise HTTPException(status_code=409, detail=RETRY_NOT_TERMINAL_MESSAGE)
    node_ids = body.node_ids if body else None
    if node_ids is not None:
        existing = set(
            (
                await db.execute(
                    select(NodeTaskItem.node_id).where(NodeTaskItem.task_id == task_id)
                )
            ).scalars().all()
        )
        invalid = [nid for nid in node_ids if nid not in existing]
        if invalid:
            ids = "、".join(str(i) for i in invalid)
            raise HTTPException(
                status_code=400, detail=f"{RETRY_INVALID_NODES_MESSAGE}：{ids}"
            )

    svc = get_node_task_service()
    # db 必须贯穿到 service：audit 骨架已在该会话 flush 并持 SQLite 写锁，
    # reset 走第二会话会自锁超时（"database is locked" → 500）
    await svc.retry_task(task_id, node_ids=node_ids, db=db)
    return {"status": "retrying", "task_id": task_id}


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
                    "skipped_nodes": task.skipped_nodes,
                    "cancelled_nodes": task.cancelled_nodes,
                    # 快照带取消请求：刷新页面重连 SSE 时「取消中」仍可显示
                    "cancel_requested": _cancel_requested_at_iso(task) is not None,
                    "cancel_requested_at": _cancel_requested_at_iso(task),
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


_FILENAME_UNSAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _log_filename_part(raw: str) -> str:
    """把 IP 等字段净化成可安全放进 Content-Disposition/zip 条目名的字符集。"""
    cleaned = _FILENAME_UNSAFE_RE.sub("_", str(raw or "")).strip("_")
    return cleaned or "node"


@global_router.get("/{task_id}/items/{node_id}/log")
async def get_task_item_log(
    task_id: int,
    node_id: int,
    tail: int = Query(default=0, ge=0),
    download: bool = Query(default=False, description="true 时以附件形式返回（供「下载」按钮）"),
    attempt: int | None = Query(default=None, ge=0, description="读取某次历史尝试的留档日志"),
    db: AsyncSession = Depends(get_db),
):
    """Read a task item's full log file (or its tail). text/plain.

    ``download=true`` 追加 ``Content-Disposition: attachment``（D10），文件名
    ``{task_id}-{ip}-{node_id}.log``；``attempt=N`` 读取第 N 次执行的留档日志
    （``{node_id}.attempt{N}.log``，重试前的证据）。
    """
    from fastapi.responses import PlainTextResponse

    from app.services import task_log_store

    async def _load_item() -> NodeTaskItem | None:
        return (
            await db.execute(
                select(NodeTaskItem).where(
                    NodeTaskItem.task_id == task_id,
                    NodeTaskItem.node_id == node_id,
                )
            )
        ).scalar_one_or_none()

    item: NodeTaskItem | None = None
    if attempt is not None:
        content = task_log_store.read_attempt_log(task_id, node_id, attempt)
        if not content:
            raise HTTPException(status_code=404, detail=f"第 {attempt} 次执行的日志不存在")
    else:
        # 有日志文件时不必查库（轮询路径保持零查询）
        content = task_log_store.read_log(task_id, node_id, tail=tail or None)
        if not content:
            item = await _load_item()
            if item is None:
                raise HTTPException(status_code=404, detail="任务节点不存在")
            content = item.stdout or item.stdout_tail or ""

    headers: dict[str, str] = {}
    if download:
        if item is None:
            item = await _load_item()
        if item is None:
            raise HTTPException(status_code=404, detail="任务节点不存在")
        ip = _log_filename_part(item.ip)
        attempt_tag = f"-attempt{attempt}" if attempt is not None else ""
        headers["Content-Disposition"] = (
            f'attachment; filename="{task_id}-{ip}-{node_id}{attempt_tag}.log"'
        )
    return PlainTextResponse(content, headers=headers)


@global_router.get("/{task_id}/logs/archive")
async def export_task_logs_archive(task_id: int, db: AsyncSession = Depends(get_db)):
    """整任务日志打包导出（D10）：``application/zip``，条目 ``{ip}/{filename}``。

    含各节点活动日志与历史尝试留档；没有日志文件的节点写进 zip 内
    ``_missing.txt``（不静默丢失）。
    """
    import io
    import zipfile

    from fastapi.responses import Response

    from app.services import task_log_store

    task = await db.get(NodeTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    items = (
        await db.execute(
            select(NodeTaskItem).where(NodeTaskItem.task_id == task_id).order_by(NodeTaskItem.id)
        )
    ).scalars().all()

    missing: list[str] = []
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in items:
            files = task_log_store.node_log_files(task_id, item.node_id)
            if not files:
                missing.append(f"{item.ip}（节点 {item.node_id}）：无日志文件")
                continue
            folder = _log_filename_part(item.ip)
            for path in files:
                if not path.exists():  # 列目录与打包之间被清理/轮转时不致 500
                    continue
                zf.write(path, f"{folder}/{path.name}")
        if missing:
            zf.writestr(
                "_missing.txt",
                "以下节点没有可导出的日志文件：\n" + "\n".join(missing) + "\n",
            )
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="task-{task_id}-logs.zip"',
        },
    )


async def asyncio_sleep(seconds: float):
    import asyncio
    await asyncio.sleep(seconds)
