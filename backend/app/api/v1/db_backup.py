"""SQLite 异地备份 / DR 恢复 API。

权限与审计对齐 database 域：全部端点要求 database_management 权限；
写操作经 audit_start 骨架 + enrich_audit 落审计（约定 #19/#37）。
临时目标（host/密码等）只进请求体，绝不出现在审计 detail 与日志。
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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


def _config_payload(row) -> dict:
    from app.core import db_config as dbc

    decrypted = None
    if row and row.password_encrypted:
        try:
            decrypted = dbc.decrypt_password(row.password_encrypted)
        except Exception:  # noqa: BLE001 - 解密失败按未配置处理
            decrypted = None
    return {
        "enabled": bool(row.enabled) if row else False,
        "host": row.host if row else None,
        "port": row.port if row else 22,
        "username": row.username if row else None,
        "auth_type": row.auth_type if row else "password",
        "has_password": bool(decrypted),
        "key_path": row.key_path if row else None,
        "remote_dir": row.remote_dir if row else None,
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
    }


def _status_payload(row) -> dict:
    """配置状态区：适用性 + 下次预估。"""
    from app.core import db_config as dbc

    cfg = dbc.load_config()
    conns, _skipped = svc.collect_sqlite_connections(cfg)
    applicable = len(conns) > 0
    reason = None if applicable else "注册表中没有 SQLite 连接，不适用"
    next_run_at = None
    if row and row.enabled:
        complete, incomplete_reason = svc.config_complete(row)
        if not complete:
            reason = incomplete_reason
        else:
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
    current_user=Depends(require_db_admin("database_management")),
):
    row = await svc.get_config_row(db)
    return {"config": _config_payload(row), "status": _status_payload(row)}


@router.put("/config")
async def update_backup_config(
    request: Request,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin("database_management")),
):
    from app.core import db_config as dbc
    from app.models.db_backup import DbBackupConfig
    from app.schemas.db_backup import DbBackupConfigUpdate

    try:
        body = DbBackupConfigUpdate(**payload)
    except Exception as exc:  # noqa: BLE001 - pydantic 校验错误统一 422
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    row = await svc.get_config_row(db)
    row.enabled = body.enabled
    row.host = body.host
    row.port = body.port
    row.username = body.username
    row.auth_type = body.auth_type
    if body.password is not None:
        row.password_encrypted = dbc.encrypt_password(body.password) if body.password else None
    row.key_path = body.key_path
    row.remote_dir = body.remote_dir
    row.interval_minutes = body.interval_minutes
    row.retain_count = body.retain_count
    row.include_static = body.include_static
    row.include_task_scripts = body.include_task_scripts
    row.include_task_logs = body.include_task_logs

    if body.enabled:
        complete, reason = svc.config_complete(row)
        if not complete:
            raise HTTPException(status_code=422, detail=f"启用前配置必须完整：{reason}")

    # enrich 必须在 commit 前（约定 #37：同事务合并落库）
    enrich_audit(
        request,
        detail=f"更新 SQLite 备份配置（enabled={body.enabled}, interval={body.interval_minutes}min, "
        f"retain={body.retain_count}, host={body.host}, dir={body.remote_dir}）",
    )
    await db.commit()
    row = await svc.get_config_row(db)
    return {"config": _config_payload(row), "status": _status_payload(row)}


@router.post("/run")
async def run_backup_now(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin("database_management")),
):
    """立即备份：不要求 enabled，但要求配置完整；备份/恢复进行中拒绝。"""
    if svc.inflight_busy():
        raise HTTPException(status_code=409, detail="已有备份/恢复任务进行中，请稍后再试")
    row = await svc.get_config_row(db)
    complete, reason = svc.config_complete(row)
    if not complete:
        raise HTTPException(status_code=422, detail=f"备份配置不完整：{reason}")
    # 先结束请求事务（审计骨架落库 + 释放写锁），备份全程不持事务（约定 #29）
    await db.commit()
    try:
        result = await svc.perform_backup(trigger="manual", db=db)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    enrich_audit(
        request,
        detail=f"手动触发 SQLite 备份：{result.get('package_name')}（{result.get('duration_ms')}ms）",
    )
    await db.commit()
    return result


@router.get("/history")
async def list_backup_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_db_admin("database_management")),
):
    from app.models.db_backup import DbBackupHistory

    total = (await db.execute(select(func.count()).select_from(DbBackupHistory))).scalar() or 0
    rows = (
        await db.execute(
            select(DbBackupHistory).order_by(DbBackupHistory.id.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()
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
            }
            for r in rows
        ],
    }


@router.post("/test")
async def test_backup_target(
    payload: dict,
    current_user=Depends(require_db_admin("database_management")),
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
    payload: RestoreTarget,
    _user=Depends(require_db_admin("database_management")),
):
    """向导步骤 1：临时目标 → 远端包列表（含 meta 摘要与差异提示）。"""
    from app.services import db_restore_service as rst

    try:
        items = await rst.list_remote_packages(_target_dict(payload))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)[:500])
    packages = []
    for i in items:
        name = i.pop("package_name")
        size = i.pop("file_size") or 0
        packages.append({"name": name, "size": size, "mtime_utc": None, "meta": i})
    return {"packages": packages}


@router.post("/restore/verify")
async def restore_verify_package(
    payload: RestoreVerifyRequest,
    _user=Depends(require_db_admin("database_management")),
):
    """向导步骤 2：下载 + 完整校验 + 暂存（verify_id 供执行步骤复用）。"""
    from app.services import db_restore_service as rst

    try:
        result = await rst.verify_and_stage(_target_dict(payload.target), payload.package_name)
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
    _user=Depends(require_db_admin("database_management")),
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
