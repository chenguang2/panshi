"""区域路由注册表快照（openspec: add-relay-gateway / relay-channel-routing）。

DB（relay_gateways / ps_cluster.region_code / ps_node）是唯一事实源。
本模块提供**进程内快照**：异步入口（lifespan / ensure_fresh / 注册表 CRUD 失效）
负责加载；同步消费方（EdgeClient.__init__、_build_ssh_cmd、注入助手）零 IO 读取。

- TTL 30s 兜底刷新；注册表 CRUD 后 invalidate() 即时生效（单 worker 部署）。
- 同 ip 多节点且区域不一致 → AMBIGUOUS → 回退直连 + 告警（跨集群同 IP 歧义防护）。
"""
from __future__ import annotations

import asyncio
import logging
import os
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
    """全局总开关（AGENTS 设计：默认关，重启生效）。"""
    return os.getenv("EDGE_RELAY_ENABLED", "0") == "1"


def invalidate() -> None:
    """注册表 CRUD 后调用：下次读取强制重载。"""
    global _loaded_at
    _loaded_at = 0.0


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


def ssh_jump_for_ip(ip: str) -> str | None:
    """仅活跃路由返回 ssh_jump；disabled/ambiguous/none → None。"""
    route, state = route_for_ip(ip)
    if state == "active" and route and route.ssh_jump:
        return route.ssh_jump
    return None


def disabled_hint_for(ip: str) -> bool:
    route, state = route_for_ip(ip)
    return state == "disabled"
