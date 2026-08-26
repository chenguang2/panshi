"""Cluster backup download/import API (change: add-cluster-json-backup)."""
import json
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.clusters import get_current_user
from app.core.database import get_db
from app.services.cluster_backup import (
    BackupOptions, build_backup, compute_checksum, import_backup,
    validate_backup_document,
)

router = APIRouter(prefix="/clusters", tags=["cluster-backup"])


def _sanitize_filename(name: str) -> str:
    import re

    return re.sub(r'[\\/:*?"<>|]', "_", name).strip() or "cluster"


@router.get("/{cluster_id}/backup")
async def download_cluster_backup(
    cluster_id: int,
    include_secrets: bool = Query(False),
    include_files: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        doc = await build_backup(db, cluster_id,
                                 options=BackupOptions(
                                     include_secrets=include_secrets,
                                     include_files=include_files))
    except ValueError:
        raise HTTPException(status_code=404, detail="集群不存在")
    from datetime import datetime

    filename = (f"{_sanitize_filename(doc['source_cluster']['name'])}"
                f"_备份_{datetime.now():%Y%m%d}.json")
    return JSONResponse(
        content=doc,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "X-Backup-Checksum": compute_checksum(doc["data"]),
        },
    )


@router.post("/import")
async def import_cluster_backup(
    file: UploadFile = File(...),
    target_cluster_name: str = Form(...),
    expected_checksum: str = Form(""),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    raw = await file.read()
    try:
        doc = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail={
            "errors": ["备份文件不是有效的 JSON"]})

    errors = validate_backup_document(
        doc, expected_checksum=expected_checksum or None)
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    try:
        result = await import_backup(
            db, doc, target_cluster_name=target_cluster_name,
            creator_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"errors": [str(exc)]})

    result["message"] = (
        "导入完成。新集群处于未发布状态，需手动发布配置才会生效到 Edge 节点。")
    return JSONResponse(content=result)
