"""网关初始化（openspec: add-relay-gateway / relay-gateway-init）。

首次装机：向该局全部网关机写入 8443 server 块 + 白名单 map，校验配置后启动/重载 OpenResty。
与 push 的边界：init 管「服务骨架」（server 监听、反代、服务进程），push 管「白名单内容」
（edge_targets map / sshd PermitOpen）；init 也会带当前白名单以便一次到位。

执行走 SSE 流式（同节点安装，`_stream_ansible_events`）：端点前置校验并落审计后立即
返回事件流，实时 stdout 行 + 进度 + 终态 `{rc, status, hosts_pattern, listen_port}`。
"""
import asyncio
import logging
from pathlib import Path
from typing import AsyncGenerator
from urllib.parse import urlparse

from app.services.ansible_service import PRIVATE_DATA_DIR, _stream_ansible_events

logger = logging.getLogger(__name__)

_GATEWAYS_INVENTORY = str(Path(PRIVATE_DATA_DIR) / "inventory" / "gateways")
_INIT_PLAYBOOK = "relay_init.yml"


class RelayInitError(RuntimeError):
    """初始化前置条件不满足（网关清单缺失）。"""


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


def listen_port_of(http_base_url: str | None) -> int:
    """从 http_base_url 提取监听端口（缺省 8443）。"""
    return urlparse(http_base_url or "").port or 8443


def ensure_gateway_inventory() -> None:
    """网关清单存在性校验（端点前置：错误需在 SSE 流开始前以 HTTP 错误返回）。"""
    if not Path(_GATEWAYS_INVENTORY).exists():
        raise RelayInitError(
            f"网关清单不存在: {_GATEWAYS_INVENTORY}（D1 装机时创建 inventory/gateways）"
        )


def _run_ansible_init(**kwargs) -> dict:
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


async def stream_init_region(
    *,
    region_code: str,
    listen_port: int,
    openresty_prefix: str,
    edge_targets_conf: str,
) -> AsyncGenerator[str, None]:
    """流式初始化该局全部网关机：写 server 块 + 白名单，nginx -t 后启动/重载。幂等可重跑。

    纯数据入参（不触库）：调用方（端点）已在其会话内完成配置渲染与审计提交。
    """
    extravars = {
        "region_code": region_code,
        "hosts_pattern": f"gateways_{region_code}",
        "openresty_prefix": openresty_prefix,
        "relay_listen_port": listen_port,
        "relay_server_conf": render_relay_server_conf(listen_port=listen_port, region_code=region_code),
        "edge_targets_conf": edge_targets_conf,
    }
    logger.info("relay init(stream): region=%s prefix=%s inventory=%s",
                region_code, openresty_prefix, _GATEWAYS_INVENTORY)

    async def _call(event_handler) -> dict:
        return await asyncio.to_thread(
            _run_ansible_init,
            private_data_dir=str(PRIVATE_DATA_DIR),
            inventory=_GATEWAYS_INVENTORY,
            playbook=_INIT_PLAYBOOK,
            extravars=extravars,
            event_handler=event_handler,
        )

    async for event in _stream_ansible_events(
        _call,
        initial_line="正在连接网关机并执行初始化（首次装机约 10–60 秒）...",
        final_extra={"hosts_pattern": extravars["hosts_pattern"], "listen_port": listen_port},
    ):
        yield event
