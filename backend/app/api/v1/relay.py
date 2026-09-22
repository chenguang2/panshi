"""跨中心区域注册表 API（openspec: add-relay-gateway / relay-region-registry）。

全局端点（无 cluster_id）：/relay/gateways CRUD + 启停。
权限：require_permission("relay_gateway")（router 级，AGENTS #19 形态 1）。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_permission
from app.models.cluster import Cluster
from app.models.relay import RelayGateway
from app.schemas.relay import (
    RelayGatewayCreate,
    RelayGatewayOut,
    RelayGatewayUpdate,
    RelayStatusUpdate,
)
from app.services import edge_sync
from app.services import relay_init
from app.services import relay_push
from app.services import relay_registry
from app.services.relay_init import RelayInitError
from app.services.relay_push import RelayPushError

router = APIRouter(prefix="/relay", tags=["relay"], dependencies=[Depends(require_permission("relay_gateway"))])


async def _get_or_404(db: AsyncSession, gateway_id: int) -> RelayGateway:
    return await edge_sync.get_or_404(db, RelayGateway, id=gateway_id, detail="区域不存在")


@router.get("/gateways", response_model=list[RelayGatewayOut])
async def list_gateways(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RelayGateway).order_by(RelayGateway.id))
    return [RelayGatewayOut.model_validate(g) for g in result.scalars()]


@router.post("/gateways", response_model=RelayGatewayOut)
async def create_gateway(payload: RelayGatewayCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(RelayGateway).where(RelayGateway.code == payload.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="区域code已存在")
    gateway = RelayGateway(**payload.model_dump())
    db.add(gateway)
    await db.commit()
    await db.refresh(gateway)
    relay_registry.invalidate()  # 注册表变更即时生效（单 worker）
    return RelayGatewayOut.model_validate(gateway)


@router.put("/gateways/{gateway_id}", response_model=RelayGatewayOut)
async def update_gateway(
    gateway_id: int, payload: RelayGatewayUpdate, db: AsyncSession = Depends(get_db)
):
    gateway = await _get_or_404(db, gateway_id)
    if payload.code is not None and payload.code != gateway.code:
        raise HTTPException(status_code=400, detail="区域code不可修改")
    changes = payload.model_dump(exclude_unset=True, exclude={"code"})
    for key, value in changes.items():
        setattr(gateway, key, value)
    await db.commit()
    await db.refresh(gateway)
    relay_registry.invalidate()
    return RelayGatewayOut.model_validate(gateway)


@router.put("/gateways/{gateway_id}/status", response_model=RelayGatewayOut)
async def update_gateway_status(
    gateway_id: int, payload: RelayStatusUpdate, db: AsyncSession = Depends(get_db)
):
    gateway = await _get_or_404(db, gateway_id)
    gateway.status = payload.status
    await db.commit()
    await db.refresh(gateway)
    relay_registry.invalidate()
    return RelayGatewayOut.model_validate(gateway)


@router.delete("/gateways/{gateway_id}")
async def delete_gateway(gateway_id: int, db: AsyncSession = Depends(get_db)):
    gateway = await _get_or_404(db, gateway_id)
    attached = await db.execute(select(Cluster).where(Cluster.region_code == gateway.code))
    clusters = attached.scalars().all()
    if clusters:
        names = ", ".join(c.display_name or c.name for c in clusters)
        raise HTTPException(status_code=409, detail=f"区域仍被集群挂接，无法删除: {names}")
    await db.delete(gateway)
    await db.commit()
    relay_registry.invalidate()
    return {"ok": True}


@router.post("/gateways/{gateway_id}/init")
async def init_gateway(gateway_id: int, db: AsyncSession = Depends(get_db)):
    """首次初始化该局网关：写 8443 server 块 + 白名单并启动 OpenResty（幂等）。"""
    gateway = await _get_or_404(db, gateway_id)
    if not gateway.openresty_prefix:
        raise HTTPException(status_code=400, detail="区域未配置 openresty_prefix，请先编辑区域填写")
    try:
        return await relay_init.init_region(
            gateway.code, openresty_prefix=gateway.openresty_prefix, db=db
        )
    except RelayInitError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/gateways/{gateway_id}/push-config")
async def push_gateway_config(gateway_id: int, db: AsyncSession = Depends(get_db)):
    """按区域渲染网关白名单并双写推送（openspec: relay-config-push）。"""
    gateway = await _get_or_404(db, gateway_id)
    try:
        return await relay_push.push_region(gateway.code, db=db)
    except RelayPushError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/health-check")
async def relay_health_check(region: str | None = None, db: AsyncSession = Depends(get_db)):
    """三段式链路体检（只读；GET 规避迁移期写锁 #32 与 mutating 审计）。"""
    from app.services import relay_health

    if region is not None:
        exists = await db.execute(select(RelayGateway).where(RelayGateway.code == region))
        if exists.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="区域不存在")
        return await relay_health.check_region(region, db=db)
    return await relay_health.check_all(db=db)
