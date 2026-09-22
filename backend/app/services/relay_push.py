"""网关白名单配置渲染与下发（openspec: add-relay-gateway / relay-config-push）。

- 渲染：以区域为单元产出 nginx map（该局节点管理端口白名单）与 sshd PermitOpen
  （该局节点 SSH 端口白名单）；白名单仅由节点表投影。
- 下发：经独立 inventory/gateways 清单（按局分组，不混入 edge_cluster——AGENTS #21①）
  推送该局全部网关机，playbook 内 `nginx -t` 后 reload（幂等）。
- **sshd PermitOpen 腿暂缓**：写 `/etc/ssh` 并 reload sshd 需 root，而网关机为非特权
  用户（见 relay_push.yml 的 `relay_sshd_enabled=false`）。渲染函数保留，特权方案
  确定后置 true 即恢复；当前只下发 nginx 白名单。
"""
import asyncio
import logging
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import Cluster, Node
from app.services.ansible_service import PRIVATE_DATA_DIR, _stream_ansible_events

logger = logging.getLogger(__name__)

_GATEWAYS_INVENTORY = str(Path(PRIVATE_DATA_DIR) / "inventory" / "gateways")
_PUSH_PLAYBOOK = "relay_push.yml"


class RelayPushError(RuntimeError):
    """下发前置条件不满足（区域不存在 / 网关清单缺失）。"""


async def _region_nodes(
    db: AsyncSession, region_code: str, *, enabled_only: bool = True
) -> list[Node]:
    """该区域节点。

    ``enabled_only=True``（默认）用于 **nginx 流量白名单**——禁用节点不承载流量；
    ``enabled_only=False`` 用于 **SSH 管理白名单（PermitOpen）**——禁用节点仍需被管理
    （状态查询/节点任务/自启动），二者语义不同。
    """
    stmt = (
        select(Node)
        .join(Cluster, Node.cluster_id == Cluster.id)
        .where(Cluster.region_code == region_code)
    )
    if enabled_only:
        stmt = stmt.where(Node.status == 1)
    result = await db.execute(stmt.order_by(Node.ip))
    return list(result.scalars().all())


async def render_nginx_map(
    region_code: str, db: AsyncSession | None = None, session_factory=None
) -> str:
    """渲染该局 nginx map 白名单（目标头 → upstream），白名单外目标网关侧拒绝。"""
    if db is None:
        from app.core.database import AsyncSessionLocal

        session_factory = session_factory or AsyncSessionLocal
        async with session_factory() as db:
            return await render_nginx_map(region_code, db=db)
    nodes = await _region_nodes(db, region_code)
    lines = [
        f"# 由磐石平台自动生成（region: {region_code}），勿手改",
        "map $http_x_edge_target $edge_upstream {",
        '    default                "";',
    ]
    for n in nodes:
        lines.append(f'    "{n.ip}:{n.management_port}"        "{n.ip}:{n.management_port}";')
    lines.append("}")
    return "\n".join(lines) + "\n"


def _sshd_header(region_code: str) -> str:
    return f"# 由磐石平台自动生成（region: {region_code}），勿手改"


async def render_permit_open(region_code: str, db: AsyncSession | None = None) -> str:
    """渲染该局 sshd PermitOpen 白名单（跳板仅可连节点 SSH 端口）。"""
    return await _render_sshd(region_code, db, with_forwarding=False)


async def render_sshd_dropin(
    region_code: str, db: AsyncSession | None = None, *, include_permitopen: bool = True
) -> str:
    """渲染网关 sshd drop-in 全文：放行 TCP 转发 + 仅允许连本局节点 SSH 端口。

    以 root 写入 ``/etc/ssh/sshd_config.d/relay-tunnel.conf``（见 relay_sshd.yml）。

    ``include_permitopen=False`` 用于**回退格式**：部分厂商 sshd（如 LinxOS）不接受
    多目标 ``PermitOpen``（``bad port number in permitopen``），此时只能仅放行转发；
    playbook 会先试带白名单的格式，``sshd -t`` 失败再回退（见 relay_sshd.yml）。
    """
    return await _render_sshd(region_code, db, with_forwarding=True, include_permitopen=include_permitopen)


async def _render_sshd(
    region_code: str,
    db: AsyncSession | None,
    *,
    with_forwarding: bool,
    include_permitopen: bool = True,
) -> str:
    if db is None:
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            return await _render_sshd(
                region_code, db, with_forwarding=with_forwarding, include_permitopen=include_permitopen
            )
    nodes = await _region_nodes(db, region_code, enabled_only=False)
    lines = [_sshd_header(region_code)]
    if with_forwarding:
        lines.append("AllowTcpForwarding yes")
    # PermitOpen 必须是**单条指令 + 逗号分隔**：sshd 对重复关键字只取首个值，写成多行
    # 时只有第一条生效，其余节点转发会被拒（实测：`channel 0: open failed:
    # administratively prohibited`，rc=255）。
    if include_permitopen and nodes:
        targets = ",".join(f"{n.ip}:{n.ssh_port or 22}" for n in nodes)
        lines.append(f"PermitOpen {targets}")
    return "\n".join(lines) + "\n"


def _run_ansible_push(**kwargs) -> dict:
    """同步薄封装（便于测试 monkeypatch）：ansible-runner 单次执行。"""
    import ansible_runner

    run_kwargs = {
        "private_data_dir": kwargs["private_data_dir"],
        "playbook": kwargs["playbook"],
        "inventory": kwargs["inventory"],
        "extravars": kwargs["extravars"],
    }
    if kwargs.get("event_handler"):
        run_kwargs["event_handler"] = kwargs["event_handler"]
    result = ansible_runner.run(**run_kwargs)
    return {"rc": getattr(result, "rc", -1), "status": getattr(result, "status", "failed")}


def ensure_gateway_inventory() -> None:
    """网关清单存在性校验（端点前置：错误需在 SSE 流开始前以 HTTP 错误返回）。"""
    if not Path(_GATEWAYS_INVENTORY).exists():
        raise RelayPushError(
            f"网关清单不存在: {_GATEWAYS_INVENTORY}（D1 装机时创建 inventory/gateways）"
        )


async def stream_push_region(
    *,
    region_code: str,
    openresty_prefix: str,
    edge_targets_conf: str,
    relay_sshd_conf: str,
) -> AsyncGenerator[str, None]:
    """流式下发该局白名单到全部网关机（当前仅 nginx 腿）；全部成功才算成功（幂等可重跑）。

    纯数据入参（不触库）：调用方（端点）已在其会话内完成白名单渲染与审计提交。
    """
    extravars = {
        "region_code": region_code,
        "hosts_pattern": f"gateways_{region_code}",
        "openresty_prefix": openresty_prefix,
        "edge_targets_conf": edge_targets_conf,
        # sshd 腿暂缓：playbook 内 relay_sshd_enabled=false 时不消费该变量，保留以便恢复
        "relay_sshd_conf": relay_sshd_conf,
    }
    logger.info("relay push(stream): region=%s inventory=%s", region_code, _GATEWAYS_INVENTORY)

    async def _call(event_handler) -> dict:
        return await asyncio.to_thread(
            _run_ansible_push,
            private_data_dir=str(PRIVATE_DATA_DIR),
            inventory=_GATEWAYS_INVENTORY,
            playbook=_PUSH_PLAYBOOK,
            extravars=extravars,
            event_handler=event_handler,
        )

    async for event in _stream_ansible_events(
        _call,
        initial_line="正在下发白名单到网关机...",
        final_extra={"hosts_pattern": extravars["hosts_pattern"]},
    ):
        yield event
