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
)

router = APIRouter(prefix="/edge-import", tags=["edge-import"])


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    body: TestConnectionRequest,
    db: AsyncSession = Depends(get_db),
):
    service = EdgeImportService(
        cluster_id=body.cluster_id,
        node_id=body.node_id,
        db_session=db,
    )
    result = service.test_connection()
    return result


@router.get("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    cluster_id: int = Query(...),
    node_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    service = EdgeImportService(
        cluster_id=cluster_id,
        node_id=node_id,
        db_session=db,
    )
    result = await service.preview_import()
    return result


@router.post("/execute", response_model=ImportExecuteResponse)
async def execute_import(
    body: ImportExecuteRequest,
    db: AsyncSession = Depends(get_db),
):
    service = EdgeImportService(
        cluster_id=body.cluster_id,
        node_id=body.node_id,
        db_session=db,
    )
    result = await service.execute_import(
        selections=body.selections,
        session=db,
    )
    return result
