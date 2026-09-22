"""网关初始化（openspec: add-relay-gateway / relay-gateway-init）。

首次装机：向该局全部网关机写入 8443 server 块 + 白名单 map，校验配置后启动/重载 OpenResty。
与 push 的边界：init 管「服务骨架」（server 监听、反代、服务进程），push 管「白名单内容」
（edge_targets map / sshd PermitOpen）；init 也会带当前白名单以便一次到位。
"""
import asyncio
import logging
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.relay import RelayGateway
from app.services.ansible_service import PRIVATE_DATA_DIR

logger = logging.getLogger(__name__)

_GATEWAYS_INVENTORY = str(Path(PRIVATE_DATA_DIR) / "inventory" / "gateways")
_INIT_PLAYBOOK = "relay_init.yml"


class RelayInitError(RuntimeError):
    """初始化前置条件不满足（区域不存在 / 网关清单缺失）。"""


def render_relay_server_conf(listen_port: int = 8443, region_code: str = "") -> str:
    """渲染中继网关 8443 server 块（含 map include；幂等整文件覆盖写）。"""
    region_note = f"region: {region_code}" if region_code else "region: unknown"
    return f"""# 由磐石平台初始化写入（{region_note}），勿手改核心段
include edge_targets.conf;

server {{
    listen {listen_port};
    server_name _;
    access_log logs/relay_access.log main buffer=16384 flush=3;

    location / {{
        # 白名单外目标直接拒绝（防 SSRF）
        if ($edge_upstream = "") {{ return 403; }}
        proxy_pass http://$edge_upstream;
        proxy_set_header Host $http_x_edge_target;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 300s;
    }}
}}
"""


def _run_ansible_init(**kwargs) -> dict:
    """同步薄封装（便于测试 monkeypatch）：ansible-runner 单次执行。"""
    import ansible_runner

    result = ansible_runner.run(
        private_data_dir=kwargs["private_data_dir"],
        playbook=kwargs["playbook"],
        inventory=kwargs["inventory"],
        extravars=kwargs["extravars"],
    )
    return {"rc": getattr(result, "rc", -1), "status": getattr(result, "status", "failed")}


async def init_region(region_code: str, openresty_prefix: str, db: AsyncSession) -> dict:
    """初始化该局全部网关机：写 server 块 + 白名单，nginx -t 后启动/重载。幂等可重跑。"""
    region = (
        await db.execute(select(RelayGateway).where(RelayGateway.code == region_code))
    ).scalar_one_or_none()
    if region is None:
        raise RelayInitError("区域不存在")

    inv_path = Path(_GATEWAYS_INVENTORY)
    if not inv_path.exists():
        raise RelayInitError(f"网关清单不存在: {inv_path}（D1 装机时创建 inventory/gateways）")

    # listen 端口从 http_base_url 提取（缺省 8443）
    parsed = urlparse(region.http_base_url or "")
    listen_port = parsed.port or 8443

    from app.services import relay_push

    edge_targets_conf = await relay_push.render_nginx_map(region_code, db=db)
    relay_server_conf = render_relay_server_conf(listen_port=listen_port, region_code=region_code)
    extravars = {
        "region_code": region_code,
        "hosts_pattern": f"gateways_{region_code}",
        "openresty_prefix": openresty_prefix,
        "relay_listen_port": listen_port,
        "relay_server_conf": relay_server_conf,
        "edge_targets_conf": edge_targets_conf,
    }
    logger.info("relay init: region=%s prefix=%s inventory=%s",
                region_code, openresty_prefix, _GATEWAYS_INVENTORY)
    result = await asyncio.to_thread(
        _run_ansible_init,
        private_data_dir=str(PRIVATE_DATA_DIR),
        inventory=_GATEWAYS_INVENTORY,
        playbook=_INIT_PLAYBOOK,
        extravars=extravars,
    )
    ok = result.get("rc") == 0
    if not ok:
        logger.warning("relay init failed: region=%s result=%s", region_code, result)
    return {
        "ok": ok,
        "region": region_code,
        "rc": result.get("rc"),
        "status": result.get("status"),
        "hosts_pattern": extravars["hosts_pattern"],
        "listen_port": listen_port,
    }
