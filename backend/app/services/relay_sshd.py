"""网关 sshd 跳板转发配置（openspec: add-relay-gateway / relay-sshd-permit）。

网关机的跳板转发默认被 sshd 拒绝（``administratively prohibited``），需以 **root**
在网关机写 ``/etc/ssh/sshd_config.d/relay-tunnel.conf`` 并 reload sshd。本模块提供：

- ``inject_gateway_creds`` / ``restore_gateway_creds``：把 root 凭据**临时**注入网关
  清单（行级改写、保留注释，跑完立即逐行还原）——与自启动同款做法；凭据只在清单里
  短暂存在，不进命令行、不落库、不打日志。
- ``stream_sshd_setup``：SSE 流式执行 ``relay_sshd.yml``（复用 ansible 事件流）。

实际执行者见 ``backend/ansible/relay_sshd.yml``（改前备份 + ``sshd -t`` 校验 +
生效性验证 + 失败自动回滚 + 仅 reload）。
"""
from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, AsyncGenerator

import yaml

from app.services.ansible_service import PRIVATE_DATA_DIR, _stream_ansible_events
from app.services import relay_push

logger = logging.getLogger(__name__)

_SSHD_PLAYBOOK = "relay_sshd.yml"

_CRED_LOCK = threading.Lock()
_CRED_BACKUP: dict[str, list[dict[str, str | None]]] = {}


def _scalar_line(indent: int, key: str, value: str) -> str:
    """生成一行 ``key: <yaml 标量>``（借助 yaml 处理含特殊字符的密码）。"""
    rendered = yaml.safe_dump({key: value}, allow_unicode=True, default_flow_style=False)
    return " " * indent + rendered.strip() + "\n"


def _gateway_hosts(hosts_pattern: str) -> list[str]:
    """解析网关清单里 ``<hosts_pattern>.hosts`` 的主机名（IP）列表。

    委派 relay_push.gateway_hosts 单一实现（init/push 前置校验与列表漂移标记同源，
    避免两份解析漂移）。"""
    return relay_push.gateway_hosts(hosts_pattern)


def _host_blocks(lines: list[str], ip: str) -> list[tuple[int, int]]:
    """返回 *ip* 全部主机块 ``(主机行索引, 块结束索引)``（不含）。

    同一网关机可出现在多个区域组（如 aoh 网关同时充当中继测试区网关）：行级
    ``ansible_user`` 跨组合并，凭据注入必须覆盖**全部**块——漏一块则未注入块的
    原身份变量胜出（2026-10-03 实发：root 流程以 jboss 连接，报
    ``/etc/ssh/sshd_config not readable``）。
    """
    blocks: list[tuple[int, int]] = []
    for i, line in enumerate(lines):
        if line.rstrip("\n").strip() != f"{ip}:":
            continue
        host_indent = len(lines[i]) - len(lines[i].lstrip())
        end = i + 1
        while end < len(lines):
            raw = lines[end]
            if raw.strip() and (len(raw) - len(raw.lstrip())) <= host_indent:
                break
            end += 1
        blocks.append((i, end))
    return blocks


def inject_gateway_creds(ip: str, user: str, password: str) -> bool:
    """为网关 *ip* 的**所有**主机块临时写入 ``ansible_user``/``ansible_ssh_pass``（行级，保留注释）。

    Returns:
        True 表示已注入（``restore_gateway_creds`` 可还原）；False 表示该 ip 不在清单中。
    """
    with _CRED_LOCK:
        try:
            with open(relay_push._GATEWAYS_INVENTORY) as f:
                lines = f.readlines()
        except (FileNotFoundError, OSError):
            return False
        blocks = _host_blocks(lines, ip)
        if not blocks:
            logger.warning("relay sshd: 网关 %s 不在清单 %s 中", ip, relay_push._GATEWAYS_INVENTORY)
            return False
        backups: list[dict[str, str | None]] = [{} for _ in blocks]
        # 倒序改写：块内插入会使后续行位移，先改后面的块可保持前面块的索引有效；
        # backups 与 blocks 升序一一对应（还原按尾部配对）。
        for (start, end), backup in zip(reversed(blocks), reversed(backups)):
            indent = (len(lines[start]) - len(lines[start].lstrip())) + 2
            for key, value in (("ansible_user", user), ("ansible_ssh_pass", password)):
                idx = next(
                    (j for j in range(start + 1, end) if lines[j].lstrip().startswith(f"{key}:")),
                    None,
                )
                if idx is None:
                    backup[key] = None
                    lines.insert(end, _scalar_line(indent, key, value))
                    end += 1
                else:
                    backup[key] = lines[idx]
                    lines[idx] = _scalar_line(indent, key, value)
        _CRED_BACKUP[ip] = backups
        with open(relay_push._GATEWAYS_INVENTORY, "w") as f:
            f.writelines(lines)
        return True


def restore_gateway_creds(ip: str) -> None:
    """还原 ``inject_gateway_creds`` 对 *ip* 全部块的改动（块内定位逐行还原，无备份时不动）。"""
    with _CRED_LOCK:
        backups = _CRED_BACKUP.pop(ip, None)
        if not backups:
            return
        try:
            with open(relay_push._GATEWAYS_INVENTORY) as f:
                lines = f.readlines()
            blocks = _host_blocks(lines, ip)
            # 尾部配对 + 倒序还原：块内删除只影响尾部已处理块的位移；清单若在注入后
            # 被手工增删块，多出的块不动（未注入），缺失的块跳过（无从还原）。
            for (start, end), backup in zip(reversed(blocks), reversed(backups)):
                for key, original in backup.items():
                    idx = next(
                        (j for j in range(start + 1, end) if lines[j].lstrip().startswith(f"{key}:")),
                        None,
                    )
                    if idx is None:
                        continue
                    if original is None:
                        del lines[idx]
                        end -= 1
                    else:
                        lines[idx] = original
            with open(relay_push._GATEWAYS_INVENTORY, "w") as f:
                f.writelines(lines)
        except (FileNotFoundError, OSError) as e:
            logger.warning("relay sshd: 还原网关 %s 凭据失败: %s", ip, e)


def _run_ansible_sshd(**kwargs: Any) -> dict:
    """同步执行 relay_sshd.yml（在线程中调用）。"""
    import ansible_runner

    run_kwargs: dict[str, Any] = {
        "private_data_dir": kwargs["private_data_dir"],
        "playbook": kwargs["playbook"],
        "inventory": kwargs["inventory"],
        "extravars": kwargs["extravars"],
    }
    if kwargs.get("event_handler"):
        run_kwargs["event_handler"] = kwargs["event_handler"]
    result = ansible_runner.run(**run_kwargs)
    return {"rc": getattr(result, "rc", -1), "status": getattr(result, "status", "failed")}


async def stream_sshd_setup(
    *,
    region_code: str,
    hosts_pattern: str,
    root_user: str,
    root_password: str,
    sshd_conf: str,
    sshd_conf_fallback: str = "",
) -> AsyncGenerator[str, None]:
    """SSE：以 root 在网关机配置 sshd 跳板转发（凭据仅本次注入、跑完即还原）。

    ``sshd_conf`` 为首选格式（含 PermitOpen 白名单）；部分厂商 sshd 不支持多目标
    PermitOpen，``sshd -t`` 失败时 playbook 会用 ``sshd_conf_fallback``（仅放行转发）
    重试（见 relay_sshd.yml）。
    """
    hosts = _gateway_hosts(hosts_pattern)
    injected = [h for h in hosts if inject_gateway_creds(h, root_user, root_password)]
    extravars = {
        "hosts_pattern": hosts_pattern,
        "sshd_conf": sshd_conf,
        "sshd_conf_fallback": sshd_conf_fallback or sshd_conf,
    }
    try:
        async def _call(event_handler: Any) -> dict:
            return await asyncio.to_thread(
                _run_ansible_sshd,
                private_data_dir=str(PRIVATE_DATA_DIR),
                inventory=relay_push._GATEWAYS_INVENTORY,
                playbook=_SSHD_PLAYBOOK,
                extravars=extravars,
                event_handler=event_handler,
            )

        async for event in _stream_ansible_events(
            _call,
            initial_line="正在以 root 连接网关机配置 sshd（校验失败会自动回滚）...",
            final_extra={"hosts_pattern": hosts_pattern},
        ):
            yield event
    finally:
        for host in injected:
            restore_gateway_creds(host)
