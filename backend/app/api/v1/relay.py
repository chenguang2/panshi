"""跨中心区域注册表 API（openspec: add-relay-gateway / relay-region-registry）。

全局端点（无 cluster_id）：/relay/gateways CRUD + 启停。
权限：require_permission("relay_gateway")（router 级，AGENTS #19 形态 1）。
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.features import feature_enabled
from app.models.cluster import Cluster, Node
from app.models.relay import RelayGateway
from app.services import gateways_inventory_service as gis
from app.services.audit import log_audit
from app.schemas.relay import (
    RelayGatewayCreate,
    RelayGatewayOut,
    RelayPushConfigRequest,
    RelayPushDrift,
    RelayConfigFile,
    RelayConfigPreview,
    RelayGatewayUpdate,
    RelaySshdSetupRequest,
    RelayStatusUpdate,
)
from app.services import edge_sync
from app.services import relay_init
from app.services import relay_push
from app.services import relay_registry
from app.services import relay_sshd
from app.services.relay_init import RelayInitError
from app.services.relay_push import RelayPushError

def _require_relay_feature():
    """relay_gateway 总闸（对齐 database.py::_require_migration_feature 模式）。

    请求期实时读 features.yaml（mtime 热加载），关闸即 404——总开关的
    「改完即时生效免重启」承诺覆盖管理面（挂载级 feature_routers 门控需重启，
    只适合静态特性）。权限依赖在前解析：无权限者先 403，404 不泄露模块存在性。
    执行路径（EdgeClient/ansible 腿）的回退直连由 relay_registry.relay_enabled()
    独立实时判定，与本检查同源热加载，双保险。
    """
    if not feature_enabled("relay_gateway"):
        raise HTTPException(status_code=404, detail="中继网关功能未启用")


router = APIRouter(
    prefix="/relay",
    tags=["relay"],
    dependencies=[Depends(require_permission("relay_gateway")), Depends(_require_relay_feature)],
)

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


async def _region_node_counts(
    db: AsyncSession,
) -> tuple[dict[str, int], dict[str, int], dict[str, list[str]]]:
    """按区域聚合节点计数与启用节点清单（"ip:管理端口"），供列表回填。

    启用行一次查询同时派生计数与清单（漂移预览 relay-push-drift-preview 用）。
    """
    enabled_rows = await db.execute(
        select(Cluster.region_code, Node.ip, Node.management_port)
        .select_from(Cluster)
        .join(Node, Node.cluster_id == Cluster.id)
        .where(Cluster.region_code.isnot(None), Node.status == 1)
    )
    enabled_lists: dict[str, list[str]] = {}
    for region_code, ip, port in enabled_rows.all():
        enabled_lists.setdefault(region_code, []).append(f"{ip}:{port}")
    enabled_counts = {k: len(v) for k, v in enabled_lists.items()}
    total_rows = await db.execute(
        select(Cluster.region_code, func.count(Node.id))
        .select_from(Cluster)
        .outerjoin(Node, Node.cluster_id == Cluster.id)
        .where(Cluster.region_code.isnot(None))
        .group_by(Cluster.region_code)
    )
    return enabled_counts, dict(total_rows.all()), enabled_lists


@router.get("/gateways", response_model=list[RelayGatewayOut])
async def list_gateways(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RelayGateway).order_by(RelayGateway.id))
    enabled_map, total_map, enabled_lists = await _region_node_counts(db)
    # 区域被集群挂接计数（relay-gateways-ux-redesign：删除菜单禁用态依据）
    attach_rows = await db.execute(
        select(Cluster.region_code, func.count(Cluster.id))
        .where(Cluster.region_code.isnot(None))
        .group_by(Cluster.region_code)
    )
    attach_map = {code: n for code, n in attach_rows.all()}

    def _parse_snapshot(raw: str | None) -> list[str] | None:
        """快照 JSON 防御性解析：缺失/坏值回退 None（诚实「无快照」态）。"""
        if raw is None:
            return None
        try:
            data = json.loads(raw)
        except ValueError:
            return None
        return data if isinstance(data, list) else None

    out: list[RelayGatewayOut] = []
    for g in result.scalars():
        row = RelayGatewayOut.model_validate(g)
        # 清单漂移标记：区域已注册但 inventory 缺该局主机组（init/push 前置会拦并给补齐片段）
        row.inventory_group_missing = not relay_push.gateway_hosts(f"gateways_{g.code}")
        # 区域节点计数（模式同上：端点计算注入，非库列）
        row.enabled_node_count = enabled_map.get(g.code, 0)
        row.total_node_count = total_map.get(g.code, 0)
        row.attached_cluster_count = attach_map.get(g.code, 0)
        # 下发漂移（relay-push-drift-preview）：当前启用集合相对快照的差集
        snapshot = _parse_snapshot(g.last_pushed_nodes)
        if snapshot is None:
            row.push_drift = None
        else:
            current = set(enabled_lists.get(g.code, []))
            last = set(snapshot)
            row.push_drift = RelayPushDrift(
                added=sorted(current - last), removed=sorted(last - current)
            )
        out.append(row)
    return out


async def _render_inventory(db: AsyncSession, exclude_code: str | None = None) -> None:
    """按 DB 全量重渲染 inventory/gateways（D3：CRUD 保存即整组重写）。

    渲染失败不阻断保存（D3 契约）：列表 inventory_group_missing 标志会亮出，
    重新保存即可重试。孤儿分组从现存文件原样保留（D4），但排除本次操作涉及
    的 code——否则删除网关后其分组会被当孤儿永久保留，新建同名网关也无法收编。
    """
    try:
        rows = (await db.execute(select(RelayGateway))).scalars().all()
        orphans = await gis.collect_orphans(db)
        if exclude_code:
            skip = f"gateways_{exclude_code}"
            orphans = [o for o in orphans if o[0] != skip]
        gis.render_and_write(list(rows), orphan_groups=orphans)
    except Exception:
        pass


@router.get("/gateways/inventory-status")
async def gateways_inventory_status(db: AsyncSession = Depends(get_db)):
    """清单健康：是否派生成品 / 孤儿分组（relay-gateway-inventory-ui）。"""
    return await gis.inventory_status(db)


@router.get("/gateways/{gateway_id}/credential")
async def gateway_credential(
    gateway_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """按需单查网关 SSH 口令（列表不回传口令；本端点单独写审计 view_credential）。"""
    gateway = await _get_or_404(db, gateway_id)
    log_audit(
        db,
        user=current_user,
        action="view_credential",
        resource="relay_gateway",
        resource_id=gateway.id,
        detail=f"查看网关口令: {gateway.code}",
    )
    await db.commit()
    return {"ssh_password": gateway.ssh_password}


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
    await _render_inventory(db, exclude_code=payload.code)
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
    await _render_inventory(db, exclude_code=gateway.code)
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
    await _render_inventory(db, exclude_code=gateway.code)
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
        relay_init.ensure_gateway_inventory(gateway.code, gateway.ssh_jump)
    except RelayInitError as e:
        raise HTTPException(status_code=503, detail=str(e))
    _acquire_region(gateway.code)
    try:
        edge_targets_conf = await relay_push.render_nginx_map(gateway.code, db=db)
        enabled_nodes = await relay_push._region_nodes(db, gateway.code)

        async def _record_snapshot() -> None:
            """终态成功 → 写下发快照（请求会话仍在依赖生命周期内，事务仅在终态后开启）。"""
            gateway.last_pushed_nodes = json.dumps(
                sorted(f"{n.ip}:{n.management_port}" for n in enabled_nodes))
            gateway.last_pushed_at = datetime.utcnow()
            await db.commit()

        stream = relay_init.stream_init_region(
            region_code=gateway.code,
            listen_port=relay_init.listen_port_of(gateway.http_base_url),
            openresty_prefix=gateway.openresty_prefix,
            edge_targets_conf=edge_targets_conf,
            on_success=_record_snapshot,
        )
        await db.commit()  # 落审计 + 释放写锁，流内 ansible 期间不再持事务
    except BaseException:
        _INFLIGHT.discard(gateway.code)
        raise
    return StreamingResponse(_region_stream(gateway.code, stream), media_type="text/event-stream")


@router.post("/gateways/{gateway_id}/push-config")
async def push_gateway_config(
    gateway_id: int,
    payload: RelayPushConfigRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """流式下发白名单到该局网关机（openspec: relay-config-push）；同 init 走 SSE。

    空名单防护（openspec: relay-push-empty-whitelist-guard）：该区域 0 个启用节点时
    默认 409——nginx 流量白名单只含启用节点，静默下发会把该局白名单覆盖为空表、
    该局发布/节点任务全部 403；显式 ``allow_empty=true`` 放行（区域下线清空场景）。
    init 不设此闸（装机引导路径：绑区域在前、挂节点在后时空白名单是合法脚手架状态）。
    """
    gateway = await _get_or_404(db, gateway_id)
    if not gateway.openresty_prefix:
        raise HTTPException(status_code=400, detail="区域未配置 openresty_prefix，请先编辑区域填写")
    try:
        relay_push.ensure_gateway_inventory(gateway.code, gateway.ssh_jump)
    except RelayPushError as e:
        raise HTTPException(status_code=503, detail=str(e))
    payload = payload or RelayPushConfigRequest()
    enabled_nodes = await relay_push._region_nodes(db, gateway.code)
    if not enabled_nodes and not payload.allow_empty:
        detail = await relay_push.empty_region_detail(db, gateway.code)
        raise HTTPException(status_code=409, detail=detail)
    pushed_nodes = sorted(f"{n.ip}:{n.management_port}" for n in enabled_nodes)
    _acquire_region(gateway.code)
    try:
        edge_targets_conf = await relay_push.render_nginx_map(gateway.code, db=db)
        relay_sshd_conf = await relay_push.render_permit_open(gateway.code, db=db)

        async def _record_snapshot() -> None:
            """终态成功 → 写下发快照（请求会话仍在依赖生命周期内，事务仅在终态后开启）。"""
            gateway.last_pushed_nodes = json.dumps(pushed_nodes)
            gateway.last_pushed_at = datetime.utcnow()
            await db.commit()

        stream = relay_push.stream_push_region(
            region_code=gateway.code,
            openresty_prefix=gateway.openresty_prefix,
            edge_targets_conf=edge_targets_conf,
            relay_sshd_conf=relay_sshd_conf,
            on_success=_record_snapshot,
        )
        await db.commit()  # 落审计 + 释放写锁（同 init）
    except BaseException:
        _INFLIGHT.discard(gateway.code)
        raise
    return StreamingResponse(_region_stream(gateway.code, stream), media_type="text/event-stream")


@router.post("/gateways/{gateway_id}/sshd-setup")
async def setup_gateway_sshd(
    gateway_id: int,
    body: RelaySshdSetupRequest,
    db: AsyncSession = Depends(get_db),
):
    """以 root 在网关机配置 sshd 跳板转发（SSE，校验失败自动回滚）。

    网关 sshd 默认禁 TCP 转发（`-W` 报 administratively prohibited），需 root 写
    `/etc/ssh/sshd_config.d/relay-tunnel.conf` 并 reload。root 凭据仅本次注入网关清单，
    跑完即还原，不落库、不进命令行（与自启动同款做法）。
    """
    gateway = await _get_or_404(db, gateway_id)
    hosts_pattern = f"gateways_{gateway.code}"
    if not relay_sshd._gateway_hosts(hosts_pattern):
        raise HTTPException(
            status_code=400,
            detail=f"网关清单中不存在主机组 {hosts_pattern}（D1 装机时创建 inventory/gateways）",
        )
    sshd_conf = await relay_push.render_sshd_dropin(gateway.code, db=db)
    # 回退格式：部分厂商 sshd 不支持多目标 PermitOpen，playbook 校验失败时会用这份
    sshd_conf_fallback = await relay_push.render_sshd_dropin(
        gateway.code, db=db, include_permitopen=False
    )
    _acquire_region(gateway.code)
    try:
        stream = relay_sshd.stream_sshd_setup(
            region_code=gateway.code,
            hosts_pattern=hosts_pattern,
            root_user=body.root_user or "root",
            root_password=body.root_password,
            sshd_conf=sshd_conf,
            sshd_conf_fallback=sshd_conf_fallback,
        )
        await db.commit()  # 落审计 + 释放写锁（同 init/push）
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
    permit_open = await relay_push.render_sshd_dropin(gateway.code, db=db)
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
            purpose=(
                "sshd 跳板转发配置（AllowTcpForwarding + PermitOpen）：可用「配置跳板转发」以 root 自动下发，"
                "或按此手工写入并 reload sshd。注：部分厂商 sshd 不支持多目标 PermitOpen（LinxOS 报 "
                "bad port number in permitopen），此时平台会自动回退为仅 AllowTcpForwarding yes"
            ),
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
