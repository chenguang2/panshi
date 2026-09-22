"""网关白名单配置渲染与下发（openspec: add-relay-gateway / relay-config-push）。

- 渲染：以区域为单元产出 nginx map（该局节点管理端口白名单）与 sshd PermitOpen
  （该局节点 SSH 端口白名单）；白名单仅由节点表投影。
- 下发：经独立 inventory/gateways 清单（按局分组，不混入 edge_cluster——AGENTS #21①）
  双写推送该局全部网关机，playbook 内逐台校验（nginx -t / sshd -t）后 reload。
"""
import asyncio
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import Cluster, Node
from app.models.relay import RelayGateway
from app.services.ansible_service import PRIVATE_DATA_DIR

logger = logging.getLogger(__name__)

_GATEWAYS_INVENTORY = str(Path(PRIVATE_DATA_DIR) / "inventory" / "gateways")
_PUSH_PLAYBOOK = "relay_push.yml"


class RelayPushError(RuntimeError):
    """下发前置条件不满足（区域不存在 / 网关清单缺失）。"""


async def _region_nodes(db: AsyncSession, region_code: str) -> list[Node]:
    result = await db.execute(
        select(Node)
        .join(Cluster, Node.cluster_id == Cluster.id)
        .where(Cluster.region_code == region_code, Node.status == 1)
        .order_by(Node.ip)
    )
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


async def render_permit_open(region_code: str, db: AsyncSession | None = None) -> str:
    """渲染该局 sshd PermitOpen 白名单（跳板仅可连节点 SSH 端口）。"""
    if db is None:
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            return await render_permit_open(region_code, db=db)
    nodes = await _region_nodes(db, region_code)
    lines = [f"# 由磐石平台自动生成（region: {region_code}），勿手改"]
    for n in nodes:
        lines.append(f"PermitOpen {n.ip}:{n.ssh_port or 22}")
    return "\n".join(lines) + "\n"


def _run_ansible_push(**kwargs) -> dict:
    """同步薄封装（便于测试 monkeypatch）：ansible-runner 单次执行。"""
    import ansible_runner

    result = ansible_runner.run(
        private_data_dir=kwargs["private_data_dir"],
        playbook=kwargs["playbook"],
        inventory=kwargs["inventory"],
        extravars=kwargs["extravars"],
    )
    return {"rc": getattr(result, "rc", -1), "status": getattr(result, "status", "failed")}


async def push_region(region_code: str, db: AsyncSession) -> dict:
    """渲染该局白名单并双写推送全部网关机；全部成功才算成功（G5，幂等可重跑）。"""
    region = (
        await db.execute(select(RelayGateway).where(RelayGateway.code == region_code))
    ).scalar_one_or_none()
    if region is None:
        raise RelayPushError("区域不存在")

    inv_path = Path(_GATEWAYS_INVENTORY)
    if not inv_path.exists():
        raise RelayPushError(f"网关清单不存在: {inv_path}（D1 装机时创建 inventory/gateways）")

    edge_targets_conf = await render_nginx_map(region_code, db=db)
    relay_sshd_conf = await render_permit_open(region_code, db=db)
    extravars = {
        "region_code": region_code,
        "hosts_pattern": f"gateways_{region_code}",
        "edge_targets_conf": edge_targets_conf,
        "relay_sshd_conf": relay_sshd_conf,
    }
    logger.info("relay push: region=%s inventory=%s", region_code, _GATEWAYS_INVENTORY)
    result = await asyncio.to_thread(
        _run_ansible_push,
        private_data_dir=str(PRIVATE_DATA_DIR),
        inventory=_GATEWAYS_INVENTORY,
        playbook=_PUSH_PLAYBOOK,
        extravars=extravars,
    )
    ok = result.get("rc") == 0
    if not ok:
        logger.warning("relay push failed: region=%s result=%s", region_code, result)
    return {
        "ok": ok,
        "region": region_code,
        "rc": result.get("rc"),
        "status": result.get("status"),
        "hosts_pattern": extravars["hosts_pattern"],
    }
