from fastapi import APIRouter, Depends, Query
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

router = APIRouter(prefix="/edge-import", tags=["edge-import"])


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
    result = service.test_connection()
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
    result = await service.preview_import()
    return result


@router.post("/execute", response_model=ImportExecuteResponse)
async def execute_import(
    body: ImportExecuteRequest,
    db: AsyncSession = Depends(get_db),
):
    service = await EdgeImportService.create(
        cluster_id=body.cluster_id,
        node_id=body.node_id,
        db_session=db,
        admin_key=body.admin_key,
    )
    result = await service.execute_import(
        selections=body.selections,
        session=db,
    )
    return result
