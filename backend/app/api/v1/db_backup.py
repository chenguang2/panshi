"""SQLite 异地备份 / DR 恢复 API。

权限与审计（设计 D6，db-backup-multi-target）：全部端点要求独立 db_backup 权限
（不再复用 database_management）；写操作经 audit_start 骨架 + enrich_audit 落审计
（约定 #19/#37）。临时目标（host/密码等）只进请求体，绝不出现在审计 detail 与日志。
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import MAX_PAGE_SIZE
from app.core.deps import require_permission
from app.core.database import get_db
from app.schemas.db_backup import (
    RestoreExecuteRequest,
    RestoreTarget,
    RestoreVerifyRequest,
)
from app.services.audit import enrich_audit
from app.services import db_backup_service as svc

router = APIRouter(prefix="/db-backup", tags=["db-backup"])

require_db_admin = require_permission

# 备份域权限键（设计 D6：独立于 database_management）
PERM_DB_BACKUP = "db_backup"


def _target_payload(t) -> dict:
    """位置行 → 响应 dict（密码不回显，仅 has_password 布尔）。"""
    from app.core import db_config as dbc

    decrypted = None
    if t.password_encrypted:
        try:
            decrypted = dbc.decrypt_password(t.password_encrypted)
        except Exception:  # noqa: BLE001 - 解密失败按未配置处理
            decrypted = None
    return {
        "id": t.id,
        "name": t.name,
        "host": t.host,
        "port": t.port,
        "username": t.username,
        "auth_type": t.auth_type,
        "has_password": bool(decrypted),
        "key_path": t.key_path,
        "remote_dir": t.remote_dir,
        "retain_count": t.retain_count,
        "enabled": bool(t.enabled),
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


async def _list_targets(db: AsyncSession) -> list:
    from app.models.db_backup import DbBackupTarget

    rows = (
        await db.execute(select(DbBackupTarget).order_by(DbBackupTarget.id.asc()))
    ).scalars().all()
    return list(rows)


def _config_payload(row, targets: list) -> dict:
    return {
        "enabled": bool(row.enabled) if row else False,
        # 旧单行目标列仅回显存量值（多目标化后代码不再读写；回滚语义见设计 D7）
        "host": row.host if row else None,
        "port": row.port if row else 22,
        "username": row.username if row else None,
        "auth_type": row.auth_type if row else "password",
        "has_password": False,
        "key_path": row.key_path if row else None,
        "remote_dir": row.remote_dir if row else None,
        "source_name": row.source_name if row else None,
        "interval_minutes": row.interval_minutes if row else 5,
        "retain_count": row.retain_count if row else 7,
        "include_static": bool(row.include_static) if row else False,
        "include_task_scripts": bool(row.include_task_scripts) if row else False,
        "include_task_logs": bool(row.include_task_logs) if row else False,
        "last_run_at": row.last_run_at if row else None,
        "last_success_at": row.last_success_at if row else None,
        "last_status": row.last_status if row else None,
        "last_error": row.last_error if row else None,
        "updated_at": row.updated_at if row else None,
        "targets": [_target_payload(t) for t in targets],
    }


def _status_payload(row, targets: list) -> dict:
    """配置状态区：适用性 + 下次预估。"""
    from app.core import db_config as dbc

    cfg = dbc.load_config()
    conns, _skipped = svc.collect_sqlite_connections(cfg)
    applicable = len(conns) > 0
    reason = None if applicable else "注册表中没有 SQLite 连接，不适用"
    enabled_targets = [t for t in targets if t.enabled]
    if applicable and not enabled_targets:
        reason = "未配置启用的备份位置"
    next_run_at = None
    if row and row.enabled and applicable and enabled_targets:
        anchor = row.last_run_at or row.last_success_at
        if anchor is None:
            next_run_at = None  # 保存启用后 30s 内首备
        else:
            from datetime import timedelta

            next_run_at = anchor + timedelta(minutes=row.interval_minutes or 5)
    in_progress = svc.inflight_busy()
    return {
        "applicable": applicable,
        "reason": reason,
        "in_progress": in_progress,
        "next_run_at": next_run_at,
        "last_success_at": row.last_success_at if row else None,
        "last_status": row.last_status if row else None,
    }


@router.get("/config")
async def get_backup_config(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    row = await svc.get_config_row(db)
    # 存量迁移兜底（lifespan 启动已跑一次；此处覆盖 lifespan 异常/直连场景）
    await svc.ensure_targets_migrated(db)
    row = await svc.get_config_row(db)
    targets = await _list_targets(db)
    return {"config": _config_payload(row, targets), "status": _status_payload(row, targets)}


@router.put("/config")
async def update_backup_config(
    request: Request,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    from app.models.db_backup import DbBackupConfig
    from app.schemas.db_backup import DbBackupConfigUpdate

    try:
        body = DbBackupConfigUpdate(**payload)
    except Exception as exc:  # noqa: BLE001 - pydantic 校验错误统一 422
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    row = await svc.get_config_row(db)
    row.enabled = body.enabled
    row.interval_minutes = body.interval_minutes
    row.include_static = body.include_static
    row.include_task_scripts = body.include_task_scripts
    row.include_task_logs = body.include_task_logs
    if body.source_name:
        row.source_name = body.source_name
    else:
        # 载荷空 → 自动解析并回写（「清空字段重存」即重解析的补救路径也走这里）。
        # 探测方向取第一个启用位置（D8）；无启用位置 → hostname → 兜底
        first_enabled = next(
            (t for t in await _list_targets(db) if t.enabled), None
        )
        await svc.resolve_source_name(
            row,
            force=True,
            probe_host=first_enabled.host if first_enabled else None,
            probe_port=first_enabled.port if first_enabled else None,
        )

    targets = await _list_targets(db)
    enrich_audit(
        request,
        detail=f"更新 SQLite 备份全局配置（enabled={body.enabled}, interval={body.interval_minutes}min, "
        f"targets={len(targets)}）",
    )
    await db.commit()
    row = await svc.get_config_row(db)
    targets = await _list_targets(db)
    return {"config": _config_payload(row, targets), "status": _status_payload(row, targets)}


# ── 位置 CRUD（设计 D9）────────────────────────────────────────────────────


async def _get_target_or_404(db: AsyncSession, target_id: int):
    from app.models.db_backup import DbBackupTarget

    row = await db.get(DbBackupTarget, target_id)
    if row is None:
        raise HTTPException(status_code=404, detail="备份位置不存在")
    return row


async def _assert_name_unique(db: AsyncSession, name: str, exclude_id: int = 0):
    from app.models.db_backup import DbBackupTarget

    dup = (
        await db.execute(
            select(DbBackupTarget).where(
                DbBackupTarget.name == name, DbBackupTarget.id != exclude_id
            )
        )
    ).scalars().first()
    if dup is not None:
        raise HTTPException(status_code=422, detail=f"位置名称已存在：{name}")


@router.get("/targets")
async def list_backup_targets(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    return {"targets": [_target_payload(t) for t in await _list_targets(db)]}


@router.post("/targets")
async def create_backup_target(
    request: Request,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    from app.core import db_config as dbc
    from app.models.db_backup import DbBackupTarget
    from app.schemas.db_backup import DbBackupTargetCreate

    try:
        body = DbBackupTargetCreate(**payload)
    except Exception as exc:  # noqa: BLE001 - pydantic 校验错误统一 422
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    await _assert_name_unique(db, body.name)
    row = DbBackupTarget(
        name=body.name,
        host=body.host,
        port=body.port,
        username=body.username,
        auth_type=body.auth_type,
        password_encrypted=dbc.encrypt_password(body.password) if body.password else None,
        key_path=body.key_path,
        remote_dir=body.remote_dir,
        retain_count=body.retain_count,
        enabled=body.enabled,
    )
    db.add(row)
    enrich_audit(request, detail=f"新增备份位置「{body.name}」（{body.host}:{body.port}{body.remote_dir}）")
    await db.commit()
    await db.refresh(row)
    return _target_payload(row)


@router.put("/targets/{target_id}")
async def update_backup_target(
    request: Request,
    target_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    from app.core import db_config as dbc
    from app.schemas.db_backup import DbBackupTargetUpdate

    try:
        body = DbBackupTargetUpdate(**payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    row = await _get_target_or_404(db, target_id)
    await _assert_name_unique(db, body.name, exclude_id=row.id)
    row.name = body.name
    row.host = body.host
    row.port = body.port
    row.username = body.username
    row.auth_type = body.auth_type
    # 密码留空 = 不修改已存密码（设计 D1）
    if body.password is not None:
        row.password_encrypted = dbc.encrypt_password(body.password)
    row.key_path = body.key_path
    row.remote_dir = body.remote_dir
    row.retain_count = body.retain_count
    row.enabled = body.enabled
    enrich_audit(request, detail=f"更新备份位置「{body.name}」（retain={body.retain_count}, enabled={body.enabled}）")
    await db.commit()
    await db.refresh(row)
    return _target_payload(row)


@router.delete("/targets/{target_id}")
async def delete_backup_target(
    request: Request,
    target_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    row = await _get_target_or_404(db, target_id)
    name = row.name
    # 删除位置不清理其远端目录（搁浅语义，与改来源标识同款——设计 Risks）
    await db.delete(row)
    enrich_audit(request, detail=f"删除备份位置「{name}」（远端目录不清理，如需请手工处理）")
    await db.commit()
    return {"ok": True}


@router.post("/targets/test")
async def test_backup_target_by_payload(
    payload: dict,
    _user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    """按载荷位置参数测连（可先于保存；密码只进内存，不落审计）。

    载荷形态与既有 POST /test 相同（连接字段均可选，host/username 必填由
    校验给出明确错误），便于编辑抽屉在保存前逐字段试连。
    """
    from app.schemas.db_backup import DbBackupTestRequest

    try:
        body = DbBackupTestRequest(**payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not body.host or not body.username:
        raise HTTPException(status_code=422, detail="主机与用户名未填写")

    target = {"host": body.host, "port": body.port or 22, "username": body.username}
    try:
        await svc._remote_exec(target, "echo panshi-backup-ok", body.password, body.key_path)
    except RuntimeError as exc:
        return {"ok": False, "message": str(exc)[:500]}
    return {"ok": True, "message": "SSH 连接成功"}


@router.post("/run")
async def run_backup_now(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    """立即备份：不要求 enabled，但要求至少一个启用位置；备份/恢复进行中拒绝。"""
    if svc.inflight_busy():
        raise HTTPException(status_code=409, detail="已有备份/恢复任务进行中，请稍后再试")
    if not await svc.get_enabled_targets(db):
        raise HTTPException(status_code=422, detail="备份配置不完整：无启用的备份位置")
    # 先结束请求事务（审计骨架落库 + 释放写锁），备份全程不持事务（约定 #29）
    await db.commit()
    try:
        result = await svc.perform_backup(trigger="manual", db=db)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    enrich_audit(
        request,
        detail=f"手动触发 SQLite 备份：{result.get('package_name')}（{result.get('duration_ms')}ms，"
        f"{sum(1 for t in (result.get('targets') or []) if t.get('status') == 'success')}/"
        f"{len(result.get('targets') or [])} 位置成功）",
    )
    await db.commit()
    return result


@router.get("/history")
async def list_backup_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    from app.models.db_backup import DbBackupHistory, DbBackupHistoryTarget

    total = (await db.execute(select(func.count()).select_from(DbBackupHistory))).scalar() or 0
    rows = (
        await db.execute(
            select(DbBackupHistory).order_by(DbBackupHistory.id.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()
    # 本页历史的每目标子结果（名称快照展示，位置删除不丢失——D4）
    history_ids = [r.id for r in rows]
    sub_rows: dict[int, list] = {}
    if history_ids:
        subs = (
            await db.execute(
                select(DbBackupHistoryTarget)
                .where(DbBackupHistoryTarget.history_id.in_(history_ids))
                .order_by(DbBackupHistoryTarget.id.asc())
            )
        ).scalars().all()
        for sr in subs:
            sub_rows.setdefault(sr.history_id, []).append(sr)
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": r.id,
                "started_at": r.started_at,
                "finished_at": r.finished_at,
                "status": r.status,
                "trigger": r.trigger,
                "package_name": r.package_name,
                "file_size": r.file_size,
                "duration_ms": r.duration_ms,
                "error": r.error,
                "targets": [
                    {
                        "target_id": sr.target_id,
                        "target_name": sr.target_name,
                        "status": sr.status,
                        "error": sr.error,
                        "duration_ms": sr.duration_ms,
                    }
                    for sr in sub_rows.get(r.id, [])
                ],
            }
            for r in rows
        ],
    }


@router.post("/test")
async def test_backup_target(
    payload: dict,
    current_user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    """测试远端连通（接受未保存的表单参数；密码只进内存，不落审计）。"""
    from app.schemas.db_backup import DbBackupTestRequest

    try:
        body = DbBackupTestRequest(**payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    host = body.host
    port = body.port
    username = body.username
    auth_type = body.auth_type
    password = body.password
    key_path = body.key_path

    # 表单未填时回退已保存配置（密码仅当表单未提供时读库）
    if not host or not username:
        row = None
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as s2:
            row = await svc.get_config_row(s2)
        if row:
            host = host or row.host
            username = username or row.username
            port = port or row.port
            auth_type = auth_type or row.auth_type
            key_path = key_path or row.key_path
            if password is None and row.password_encrypted:
                from app.core import db_config as dbc

                try:
                    password = dbc.decrypt_password(row.password_encrypted)
                except Exception:  # noqa: BLE001
                    password = None

    if not host or not username:
        raise HTTPException(status_code=422, detail="主机与用户名未配置")

    target = {"host": host, "port": port or 22, "username": username}
    try:
        await svc._remote_exec(target, "echo panshi-backup-ok", password, key_path)
    except RuntimeError as exc:
        return {"ok": False, "message": str(exc)[:500]}
    return {"ok": True, "message": "SSH 连接成功"}


# ── 恢复向导 ────────────────────────────────────────────────────────────────


def _target_dict(t) -> dict:
    """RestoreTarget schema → service target dict（含凭据）。"""
    return {
        "host": t.host,
        "port": t.port,
        "username": t.username,
        "auth_type": t.auth_type,
        "password": t.password,
        "private_key_path": t.key_path,
        "remote_dir": t.remote_dir,
    }


@router.post("/restore/list")
async def restore_list_packages(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    """向导步骤 1：列远端包（含 meta 摘要与差异提示）。

    三种模式（设计 D6/D9，二选一校验）：
    - target_id：按已配置位置列包（下拉选择）
    - 手输目标参数（host/username/...）：临时目标
    - 两者均无：聚合全部已配置位置（含停用；去重合并 + 存在位置标注 + 不可达不阻断）
    """
    from app.services import db_restore_service as rst

    target_id = payload.get("target_id")
    has_manual = any(payload.get(k) for k in ("host", "username", "remote_dir"))
    if target_id is not None and has_manual:
        raise HTTPException(status_code=422, detail="target_id 与手输目标参数只能二选一")

    def _package_rows(items: list) -> list:
        packages = []
        for i in items:
            name = i.pop("package_name")
            size = i.pop("file_size") or 0
            present = i.pop("_present", [])
            source = i.pop("source", None)
            source_renamed = i.pop("source_renamed", False)
            packages.append(
                {
                    "name": name,
                    "size": size,
                    "mtime_utc": None,
                    "source": source,
                    "source_renamed": source_renamed,
                    "present_in": present,
                    "meta": i,
                }
            )
        return packages

    if target_id is not None:
        try:
            items = await rst.list_by_target_id(int(target_id), db=db)
        except RuntimeError as exc:
            msg = str(exc)
            if "不存在" in msg:
                raise HTTPException(status_code=404, detail=msg) from exc
            raise HTTPException(status_code=422, detail=msg[:500]) from exc
        return {"packages": _package_rows(items), "targets_status": [], "hint": None}

    if has_manual:
        try:
            body = RestoreTarget(**payload)
            items = await rst.list_remote_packages(_target_dict(body))
        except RuntimeError as exc:
            raise HTTPException(status_code=422, detail=str(exc)[:500]) from exc
        return {"packages": _package_rows(items), "targets_status": [], "hint": None}

    result = await rst.list_aggregated(db=db)
    return {
        "packages": _package_rows(result["packages"]),
        "targets_status": result["targets_status"],
        "hint": result["hint"],
    }


@router.post("/restore/verify")
async def restore_verify_package(
    payload: RestoreVerifyRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    """向导步骤 2：下载 + 完整校验 + 暂存（verify_id 供执行步骤复用）。

    target 三形态（对齐 /restore/list）：target_id 引用已配置位置（服务端解密凭据，
    前端无明文可回传）；或手输连接字段组（host/username/remote_dir 必填）。
    """
    from app.services import db_restore_service as rst

    ref = payload.target
    if ref.target_id is not None:
        specs = await rst._configured_target_specs(db=db)
        target = next((t for tid, _n, t in specs if tid == ref.target_id), None)
        if target is None:
            raise HTTPException(status_code=404, detail=f"备份位置不存在：{ref.target_id}")
    else:
        missing = [k for k in ("host", "username", "remote_dir") if not getattr(ref, k, None)]
        if missing:
            raise HTTPException(
                status_code=422, detail=f"手输目标缺少字段：{'、'.join(missing)}（或提供 target_id）"
            )
        target = _target_dict(ref)
    # 审计骨架落库并释放写锁（约定 #29/#48）：后续 scp 下载为长外部 IO，不能持锁等待
    await db.commit()
    try:
        result = await rst.verify_and_stage(target, payload.package_name)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)[:500])
    current = svc._app_version_info().get("app_version")
    version_note = None
    pkg_version = result.get("app_version")
    if pkg_version and current and pkg_version != current:
        version_note = f"备份包版本 {pkg_version} 与当前应用 {current} 不一致"
    return {
        "verify_id": result["verify_id"],
        "package_name": result["package_name"],
        "size": 0,
        "meta": result,
        "version_note": version_note,
        "checks": {
            "tar_integrity": "ok",
            "sha256": "ok",
            "db_integrity": {k: v.get("integrity") for k, v in (result.get("databases") or {}).items()},
            "key_tables": "ok",
        },
    }


@router.post("/restore/execute")
async def restore_execute(
    payload: RestoreExecuteRequest,
    request: Request,
    db=Depends(get_db),
    _user=Depends(require_db_admin(PERM_DB_BACKUP)),
):
    """向导步骤 3：高危确认后落位激活（互斥 + 运行中任务检查 + 引擎重载）。"""
    from app.services import db_restore_service as rst

    try:
        result = await rst.execute_restore(payload.verify_id, confirmed=payload.confirmed, db=db)
    except RuntimeError as exc:
        enrich_audit(request, detail=f"恢复被拒绝：{str(exc)[:500]}")
        await db.commit()
        raise HTTPException(status_code=409, detail=str(exc)[:500])
    enrich_audit(request, detail=f"恢复并激活 active={result.get('active_connection_id')}")
    await db.commit()
    return {
        "success": True,
        "active_connection_id": result.get("active_connection_id"),
        "restored_databases": result.get("restored_databases", []),
        "pre_restore_file": result.get("pre_restore_file"),
        "message": result.get("message", "恢复完成"),
    }
