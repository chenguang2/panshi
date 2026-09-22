"""跨中心区域注册表 API（openspec: add-relay-gateway / relay-region-registry）。

全局端点（无 cluster_id）：/relay/gateways CRUD + 启停。
权限：require_permission("relay_gateway")（router 级，AGENTS #19 形态 1）。
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_permission
from app.models.cluster import Cluster
from app.models.relay import RelayGateway
from app.schemas.relay import (
    RelayConfigFile,
    RelayConfigPreview,
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

# 同区域并发保护（单进程）：acquire 在端点（SSE 开始前可返回 409）；release 由流的 finally
# 调用——客户端断连也会触发 finally，规则 #33 要求 finally 只做同步操作（discard 满足）。
_INFLIGHT: set[str] = set()


def _acquire_region(region_code: str) -> None:
    if region_code in _INFLIGHT:
        raise HTTPException(
            status_code=409,
            detail=f"区域「{region_code}」已有进行中的初始化/下发任务，请等待其结束",
        )
    _INFLIGHT.add(region_code)


async def _region_stream(region_code: str, stream):
    """SSE 事件流转发：流结束/客户端断连时释放并发占位。"""
    try:
        async for event in stream:
            yield event
    finally:
        _INFLIGHT.discard(region_code)


async def _get_or_404(db: AsyncSession, gateway_id: int) -> RelayGateway:
    return await edge_sync.get_or_404(db, RelayGateway, id=gateway_id, detail="区域不存在")


async def _refresh_routing() -> None:
    """注册表变更后立即重载快照（单 worker）。

    仅 `invalidate()` 不够：它只把 _loaded_at 置 0，而同步读取方
    route_for_ip/route_for_cluster 走 _require_snapshot() 不判 TTL → 路由变更实际
    要等进程重启才生效。故此处显式 force 重载。
    """
    await relay_registry.ensure_fresh(force=True)


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
    await _refresh_routing()  # 注册表变更立即重载（仅 invalidate 需重启才生效）
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
    await _refresh_routing()
    return RelayGatewayOut.model_validate(gateway)


@router.put("/gateways/{gateway_id}/status", response_model=RelayGatewayOut)
async def update_gateway_status(
    gateway_id: int, payload: RelayStatusUpdate, db: AsyncSession = Depends(get_db)
):
    gateway = await _get_or_404(db, gateway_id)
    gateway.status = payload.status
    await db.commit()
    await db.refresh(gateway)
    await _refresh_routing()
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
    await _refresh_routing()
    return {"ok": True}


@router.post("/gateways/{gateway_id}/init")
async def init_gateway(gateway_id: int, db: AsyncSession = Depends(get_db)):
    """流式首次初始化：写 8443 server 块 + 白名单并启动/重载 OpenResty（幂等）。

    前置校验（区域/前缀/网关清单）在流开始前完成，错误以 HTTP 4xx/5xx 返回；通过后
    在请求会话内渲染配置并 commit（同时释放写锁并落审计——AGENTS #29），再交出 SSE
    事件流（实时 stdout 行 + 进度 + 终态 `{rc, status, hosts_pattern, listen_port}`）。
    """
    gateway = await _get_or_404(db, gateway_id)
    if not gateway.openresty_prefix:
        raise HTTPException(status_code=400, detail="区域未配置 openresty_prefix，请先编辑区域填写")
    try:
        relay_init.ensure_gateway_inventory()
    except RelayInitError as e:
        raise HTTPException(status_code=503, detail=str(e))
    _acquire_region(gateway.code)
    try:
        edge_targets_conf = await relay_push.render_nginx_map(gateway.code, db=db)
        stream = relay_init.stream_init_region(
            region_code=gateway.code,
            listen_port=relay_init.listen_port_of(gateway.http_base_url),
            openresty_prefix=gateway.openresty_prefix,
            edge_targets_conf=edge_targets_conf,
        )
        await db.commit()  # 落审计 + 释放写锁，流内 ansible 期间不再持事务
    except BaseException:
        _INFLIGHT.discard(gateway.code)
        raise
    return StreamingResponse(_region_stream(gateway.code, stream), media_type="text/event-stream")


@router.post("/gateways/{gateway_id}/push-config")
async def push_gateway_config(gateway_id: int, db: AsyncSession = Depends(get_db)):
    """流式下发白名单到该局网关机（openspec: relay-config-push）；同 init 走 SSE。"""
    gateway = await _get_or_404(db, gateway_id)
    if not gateway.openresty_prefix:
        raise HTTPException(status_code=400, detail="区域未配置 openresty_prefix，请先编辑区域填写")
    try:
        relay_push.ensure_gateway_inventory()
    except RelayPushError as e:
        raise HTTPException(status_code=503, detail=str(e))
    _acquire_region(gateway.code)
    try:
        edge_targets_conf = await relay_push.render_nginx_map(gateway.code, db=db)
        relay_sshd_conf = await relay_push.render_permit_open(gateway.code, db=db)
        stream = relay_push.stream_push_region(
            region_code=gateway.code,
            openresty_prefix=gateway.openresty_prefix,
            edge_targets_conf=edge_targets_conf,
            relay_sshd_conf=relay_sshd_conf,
        )
        await db.commit()  # 落审计 + 释放写锁（同 init）
    except BaseException:
        _INFLIGHT.discard(gateway.code)
        raise
    return StreamingResponse(_region_stream(gateway.code, stream), media_type="text/event-stream")


@router.get("/gateways/{gateway_id}/config-preview", response_model=RelayConfigPreview)
async def preview_gateway_config(gateway_id: int, db: AsyncSession = Depends(get_db)):
    """预览将要写入网关机的配置文件内容（只读、不触网）。

    用途：界面展示 init 的 nginx 配置与 push 的白名单内容，用户可直接复制；当 ansible
    不可用时也可据此手工在网关机上配置。内容由与下发相同的渲染函数产出，保证一致。
    """
    gateway = await _get_or_404(db, gateway_id)
    if not gateway.openresty_prefix:
        raise HTTPException(
            status_code=400, detail="区域未配置 openresty_prefix，无法推导配置文件路径"
        )
    prefix = gateway.openresty_prefix.rstrip("/")
    conf_dir = f"{prefix}/conf"
    listen_port = relay_init.listen_port_of(gateway.http_base_url)
    edge_targets = await relay_push.render_nginx_map(gateway.code, db=db)
    permit_open = await relay_push.render_permit_open(gateway.code, db=db)
    files = [
        RelayConfigFile(
            path=f"{conf_dir}/relay_8443.conf",
            content=relay_init.render_relay_server_conf(
                listen_port=listen_port, region_code=gateway.code
            ),
            purpose="8443 server 块（「初始化网关」写入）",
        ),
        RelayConfigFile(
            path=f"{conf_dir}/edge_targets.conf",
            content=edge_targets,
            purpose="节点白名单 map（「初始化网关」/「下发配置」写入）",
        ),
        RelayConfigFile(
            path=f"{conf_dir}/nginx.conf",
            content="    include relay_8443.conf;",
            purpose="在 nginx.conf 的 http 块末尾追加该 include（「初始化网关」写入，已存在则跳过）",
        ),
        RelayConfigFile(
            path="/etc/ssh/sshd_config.d/relay-tunnel.conf",
            content=permit_open,
            purpose="sshd PermitOpen 白名单（当前暂缓，平台不下发；如需手工启用请写入后 reload sshd）",
        ),
    ]
    notes = [
        f"手工应用：将以上内容写入对应路径（OpenResty 前缀 {prefix}）。",
        f"校验配置：{prefix}/sbin/nginx -p {prefix} -c conf/nginx.conf -t",
        f"重载（已运行）：{prefix}/sbin/nginx -p {prefix} -c conf/nginx.conf -s reload；未运行则直接启动。",
        "本窗口为只读预览，不会改动网关机；调整节点/集群后重新打开即可刷新白名单。",
    ]
    return RelayConfigPreview(
        region_code=gateway.code,
        openresty_prefix=prefix,
        listen_port=listen_port,
        files=files,
        notes=notes,
    )


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
