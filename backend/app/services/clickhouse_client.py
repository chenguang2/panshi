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
# 全局配置版本：写配置 API 保存成功后调用 invalidate() 自增；
# 各工作线程在 get_client() 比对版本，不一致则废弃线程局部连接重建
# （免重启生效，见 openspec add-clickhouse-config-page design D3）。
_config_version: int = 0

# 新路径与 db_config.json 平级；旧路径保留读取兼容（部署残留）
_CONFIG_PATH = Path(__file__).resolve().parents[2] / "clickhouse.yaml"
_LEGACY_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "clickhouse.yaml"

_DEFAULTS: dict[str, Any] = {
    "host": "127.0.0.1",
    "port": 9000,
    "database": "esapm_metrics",
    "user": "default",
    "password": "",
    "connect_timeout": 5,
}


def _resolve_active(raw: dict) -> dict:
    """把配置文件原始内容归一化为连接参数 dict。

    新格式：connections[] + active（id 找不到回落首条；password_enc 解密）。
    旧格式：顶层单连接字段（含明文 password 键），直接兼容。
    """
    cfg = dict(_DEFAULTS)
    conns = raw.get("connections")
    if isinstance(conns, list) and conns:
        active = next((c for c in conns if isinstance(c, dict) and c.get("id") == raw.get("active")),
                      conns[0])
        for k in ("host", "port", "database", "user", "connect_timeout"):
            if active.get(k) is not None:
                cfg[k] = active[k]
        if active.get("password_enc"):
            from app.core.db_config import decrypt_password
            pw = decrypt_password(active["password_enc"])
            if not pw:
                logger.error("clickhouse password 无法解密（密钥轮换？），请在配置页重新录入: %s", active.get("id"))
            cfg["password"] = pw
    else:
        for k in ("host", "port", "database", "user", "password", "connect_timeout"):
            if raw.get(k) is not None:
                cfg[k] = raw[k]
    return cfg


def _load_config(path: str | Path | None = None) -> dict:
    global _config
    if _config is not None:
        return _config
    candidates = [Path(path)] if path else [_CONFIG_PATH, _LEGACY_CONFIG_PATH]
    for p in candidates:
        if p.exists():
            try:
                raw = yaml.safe_load(p.read_text(encoding="utf-8"))
            except Exception as exc:
                logger.warning("clickhouse config read failed %s: %s", p, exc)
                raw = None
            _config = _resolve_active(raw) if isinstance(raw, dict) else dict(_DEFAULTS)
            return _config
    _config = dict(_DEFAULTS)
    return _config


def invalidate() -> None:
    """配置写盘成功后调用：清空缓存并自增版本号，令所有线程下次取连接时重建。"""
    global _config, _config_version
    _config = None
    _config_version += 1


def get_client() -> Client | None:
    client = getattr(_local, "client", None)
    if client is not None and getattr(_local, "version", -1) == _config_version:
        return client
    if client is not None:
        # 版本已变：废弃本线程旧连接（其余线程各自惰性重建）
        try:
            client.disconnect()
        except Exception:
            pass
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
    _local.version = _config_version
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
