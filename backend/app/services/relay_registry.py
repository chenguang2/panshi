"""区域路由注册表快照（openspec: add-relay-gateway / relay-channel-routing）。

DB（relay_gateways / ps_cluster.region_code / ps_node）是唯一事实源。
本模块提供**进程内快照**：异步入口（lifespan / ensure_fresh / 注册表 CRUD 失效）
负责加载；同步消费方（EdgeClient.__init__、_build_ssh_cmd、注入助手）零 IO 读取。

- TTL 30s 兜底刷新；注册表 CRUD 后必须 `await ensure_fresh(force=True)` 立即重载——
  `invalidate()` 只置脏标记，而同步读取方（route_for_ip/route_for_cluster）不判 TTL，
  仅 invalidate 会让路由变更等到重启才生效（relay.py 的 _refresh_routing 已按此修）。
- 同 ip 多节点且区域不一致 → AMBIGUOUS → 回退直连 + 告警（跨集群同 IP 歧义防护）。
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from sqlalchemy import select

logger = logging.getLogger(__name__)

TTL_SECONDS = 30.0
AMBIGUOUS = "__ambiguous__"

# 状态语义：active=经网关；disabled=区域被禁用（直连+提示）；none=无路由；
# ambiguous=跨集群同 IP 歧义；off=总开关关闭
State = str


@dataclass
class RelayRoute:
    code: str
    http_base_url: str | None
    ssh_jump: str | None
    status: str

    @property
    def active(self) -> bool:
        return self.status == "enabled" and bool(self.http_base_url or self.ssh_jump)


@dataclass
class RelaySnapshot:
    routes: dict[str, RelayRoute] = field(default_factory=dict)
    cluster_region: dict[int, str] = field(default_factory=dict)
    node_region: dict[str, str] = field(default_factory=dict)  # ip -> code | AMBIGUOUS

    def route_for_ip(self, ip: str) -> tuple[RelayRoute | None, State]:
        code = self.node_region.get(ip)
        if code is None:
            return None, "none"
        if code == AMBIGUOUS:
            return None, "ambiguous"
        route = self.routes.get(code)
        if route is None:
            return None, "none"  # 区域被删除但集群仍挂接（悬空引用）
        if not route.active:
            return route, "disabled"
        return route, "active"

    def route_for_cluster(self, cluster_id: int) -> tuple[RelayRoute | None, State]:
        code = self.cluster_region.get(cluster_id)
        if code is None:
            return None, "none"
        route = self.routes.get(code)
        if route is None:
            return None, "none"
        if not route.active:
            return route, "disabled"
        return route, "active"


_snapshot: RelaySnapshot | None = None
_loaded_at: float = 0.0
_lock = asyncio.Lock()


def relay_enabled() -> bool:
    """中继总开关：features.yaml 的 ``features.relay_gateway``（显式 opt-in，默认关）。

    - 敏感开关：会改变节点网络路径（HTTP 走 X-Edge-Target、SSH 走 -J 跳板），必须
      在 features.yaml 显式写 ``relay_gateway: true`` 才启用（缺失即视为关闭，不走
      features.yaml 的 opt-out 约定）。
    - mtime 热加载：改完 features.yaml 即时生效，无需重启（较原 EDGE_RELAY_ENABLED
      环境变量更可观测、可校验）。
    """
    from app.core.features import get_features

    return bool(get_features().get("features", {}).get("relay_gateway", False))


def invalidate() -> None:
    """注册表 CRUD 后调用：置脏并丢弃快照。

    同步读取方（route_for_ip/route_for_cluster）不判 TTL，若只置 `_loaded_at=0`
    仍会继续用旧快照；因此这里直接清空 `_snapshot`，让读取方在下次
    `ensure_fresh()` 之前回退直连（宁可直连，也不可用陈旧路由）。
    """
    global _loaded_at, _snapshot
    _loaded_at = 0.0
    _snapshot = None


async def refresh_routing() -> None:
    """路由相关写操作（网关/集群/节点 CRUD）提交后强制重载快照。

    快照的 cluster_region/node_region 派生自 ``ps_cluster.region_code`` 与
    ``ps_node``；同步读取方（`run_playbook` 的跳板注入、EdgeClient）只走
    `_require_snapshot()` 不判 TTL，故**任何**改动这三张表的写操作后都必须显式
    force 重载，否则要等进程重启才生效——2026-09-23 实测：给集群绑定区域后
    `192.168.0.14` 仍直连，正是集群更新未触发重载所致。

    调用方须在 DB **提交之后**调用（避免与审计骨架的写锁叠加）。
    """
    await ensure_fresh(force=True)


async def ensure_fresh(session_factory=None, force: bool = False) -> RelaySnapshot:
    """TTL 过期/未加载/force 时从 DB 重载快照。异步入口调用。"""
    global _snapshot, _loaded_at
    if not force and _snapshot is not None and (time.monotonic() - _loaded_at) < TTL_SECONDS:
        return _snapshot
    async with _lock:
        if not force and _snapshot is not None and (time.monotonic() - _loaded_at) < TTL_SECONDS:
            return _snapshot
        if session_factory is None:
            from app.core.database import AsyncSessionLocal

            session_factory = AsyncSessionLocal
        # 延迟导入：避免 models ↔ services 循环依赖
        from app.models.cluster import Cluster as _Cluster
        from app.models.cluster import Node as _Node
        from app.models.relay import RelayGateway as _RelayGateway

        snapshot = RelaySnapshot()
        async with session_factory() as s:
            gateways = (await s.execute(select(_RelayGateway))).scalars().all()
            clusters = (await s.execute(select(_Cluster.id, _Cluster.region_code))).all()
            nodes = (await s.execute(select(_Node.ip, _Node.cluster_id))).all()
        for g in gateways:
            snapshot.routes[g.code] = RelayRoute(
                code=g.code, http_base_url=g.http_base_url, ssh_jump=g.ssh_jump, status=g.status
            )
        for cid, code in clusters:
            if code:
                snapshot.cluster_region[cid] = code
        ip_codes: dict[str, str] = {}
        for ip, cid in nodes:
            code = snapshot.cluster_region.get(cid)
            if not code:
                continue
            prev = ip_codes.get(ip)
            if prev is None:
                ip_codes[ip] = code
            elif prev != code:
                ip_codes[ip] = AMBIGUOUS
        snapshot.node_region = ip_codes
        _snapshot = snapshot
        _loaded_at = time.monotonic()
        return _snapshot


def _require_snapshot() -> RelaySnapshot | None:
    """同步读：快照未加载（异步入口从未跑过）时返回 None 并告警一次。"""
    if _snapshot is None:
        logger.warning("relay registry snapshot not loaded yet; treating as direct connection")
        return None
    return _snapshot


def route_for_ip(ip: str) -> tuple[RelayRoute | None, State]:
    snap = _require_snapshot()
    if snap is None:
        return None, "off"
    return snap.route_for_ip(ip)


def route_for_cluster(cluster_id: int) -> tuple[RelayRoute | None, State]:
    snap = _require_snapshot()
    if snap is None:
        return None, "off"
    return snap.route_for_cluster(cluster_id)


def _jump_host(ssh_jump: str) -> str:
    """从 ``user@host[:port]``（或 ``user@[v6]:port``）提取主机部分。"""
    host_port = ssh_jump.rsplit("@", 1)[-1]
    if host_port.startswith("["):
        end = host_port.find("]")
        return host_port[1:end] if end != -1 else host_port
    return host_port.rsplit(":", 1)[0] if ":" in host_port else host_port


def ssh_jump_for_ip(ip: str) -> str | None:
    """仅活跃路由返回 ssh_jump；disabled/ambiguous/none/自跳 → None。

    自跳守卫：跳板主机与目标主机相同（网关机同时被当作该集群的业务节点，如
    aoh 网关 jboss@192.168.0.13 与该集群节点 192.168.0.13）时返回 None —— 经
    自己去连自己会让 ssh 直接报 ``jumphost loop``（实测表现为
    ``Connection closed by UNKNOWN port 65535``），且语义上本就不需要跳板。
    """
    route, state = route_for_ip(ip)
    if state != "active" or route is None or not route.ssh_jump:
        return None
    if _jump_host(route.ssh_jump) == ip:
        logger.debug("relay: 跳板主机与目标相同(%s)，跳过中继回退直连", ip)
        return None
    return route.ssh_jump


def disabled_hint_for(ip: str) -> bool:
    route, state = route_for_ip(ip)
    return state == "disabled"
