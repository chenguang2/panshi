import asyncio

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.edge_import_service import EdgeImportService
from app.schemas.edge_import import (
    TestConnectionRequest,
    TestConnectionResponse,
    ImportPreviewResponse,
    ImportExecuteRequest,
    ImportExecuteResponse,
    PreviewRequest,
)

from app.core.deps import require_permission
from app.services.audit import enrich_audit

router = APIRouter(prefix="/edge-import", tags=["edge-import"], dependencies=[Depends(require_permission('edge_import'))])


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    body: TestConnectionRequest,
    db: AsyncSession = Depends(get_db),
):
    service = await EdgeImportService.create(
        cluster_id=body.cluster_id,
        node_id=body.node_id,
        db_session=db,
        admin_key=body.admin_key,
    )
    await db.commit()  # 落审计骨架 + 释放写锁（#29：同步网络 IO 前结束事务）
    result = {**await asyncio.to_thread(service.test_connection), **service.route_info}
    return result


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    body: PreviewRequest,
    db: AsyncSession = Depends(get_db),
):
    service = await EdgeImportService.create(
        cluster_id=body.cluster_id,
        node_id=body.node_id,
        db_session=db,
        admin_key=body.admin_key,
    )
    await db.commit()  # 落审计骨架 + 释放写锁（#29：长网络 IO 前结束事务）
    result = {**await service.preview_import(), **service.route_info}
    return result


@router.post("/execute", response_model=ImportExecuteResponse)
async def execute_import(
    body: ImportExecuteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    service = await EdgeImportService.create(
        cluster_id=body.cluster_id,
        node_id=body.node_id,
        db_session=db,
        admin_key=body.admin_key,
    )
    enrich_audit(request, detail=f"从节点 {body.node_id} 导入集群 {body.cluster_id}")
    await db.commit()  # 落审计骨架 + 释放写锁（#29：长网络 IO 前结束事务）
    result = {**await service.execute_import(
        selections=body.selections,
        session=db,
    ), **service.route_info}
    await db.commit()  # 持久化导入写入
    return result
