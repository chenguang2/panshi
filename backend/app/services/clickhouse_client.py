"""ClickHouse connection management.

Provides a lazily-initialized global Client instance configured via
clickhouse.yaml.  All public functions are safe to call even when
ClickHouse is unreachable — they return None / empty results instead of
raising.
"""

import logging
import os
import threading
from pathlib import Path
from typing import Any

import yaml
from clickhouse_driver import Client

logger = logging.getLogger(__name__)

# clickhouse_driver 的 Client 非线程安全：必须每线程独立连接。
# metrics API 经 asyncio.to_thread 并发调用 execute_query，若共享同一条
# TCP 连接，协议状态会被竞争破坏（表现为查询静默返回空结果）。
_local = threading.local()
_config: dict | None = None

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "clickhouse.yaml"

_DEFAULTS: dict[str, Any] = {
    "host": "127.0.0.1",
    "port": 9000,
    "database": "esapm_metrics",
    "user": "default",
    "password": "",
    "connect_timeout": 5,
}


def _load_config(path: str | Path | None = None) -> dict:
    global _config
    if _config is not None:
        return _config
    p = Path(path) if path else _CONFIG_PATH
    if p.exists():
        raw = yaml.safe_load(p.read_text(encoding="utf-8"))
        cfg = dict(_DEFAULTS)
        if isinstance(raw, dict):
            cfg.update(raw)
        _config = cfg
    else:
        _config = dict(_DEFAULTS)
    return _config


def get_client() -> Client | None:
    client = getattr(_local, "client", None)
    if client is not None:
        return client
    cfg = _load_config()
    try:
        client = Client(
            host=cfg["host"],
            port=cfg["port"],
            database=cfg["database"],
            user=cfg["user"],
            password=cfg["password"],
            connect_timeout=cfg["connect_timeout"],
            settings={"connect_timeout": cfg["connect_timeout"]},
        )
        logger.info("clickhouse connected to %s:%s/%s", cfg["host"], cfg["port"], cfg["database"])
    except Exception as exc:
        logger.warning("clickhouse connection failed: %s", exc)
        client = None
    _local.client = client
    return client


def execute_query(sql: str, params: dict | None = None) -> list[tuple] | None:
    client = get_client()
    if client is None:
        return None
    try:
        return client.execute(sql, params)
    except Exception as exc:
        logger.warning("clickhouse query failed: %s", exc)
        return None


def close_client() -> None:
    # 仅断开当前线程的连接；工作线程的连接随线程结束/进程退出释放
    client = getattr(_local, "client", None)
    if client is not None:
        try:
            client.disconnect()
        except Exception:
            pass
    _local.client = None
