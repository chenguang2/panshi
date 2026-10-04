"""五维代码审查（code-review-2026-10-04）P0 批次回归测试。

S1 部署密钥链：deployment unit 的占位密钥 your-production-secret-key 必须被
    _PLACEHOLDER_SECRETS 黑名单拦截；unit 模板不得内置任何密钥值，且必须
    显式 APP_ENV=production + EnvironmentFile 注入（fail-fast 而非静默弱密钥）。
S2 edge_import 事件循环冻结：fetch_edge_data / test_connection 为同步网络 IO，
    必须卸载到工作线程（asyncio.to_thread）；三个端点在长 IO 前必须 db.commit()
    落审计骨架并释放 SQLite 写锁（约定 #29 范式，防假 401）。
S3 数据库连接测试伪异步：_do_test 协程体内同步连接探测必须在工作线程执行，
    否则 asyncio.wait_for(3s) 无 await 点可取消，永不生效。

全部用例不触网；线程判定用 threading.current_thread() is not threading.main_thread()。
"""

import threading
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.security import _is_placeholder
from app.services.edge_import_service import EdgeImportService

REPO_ROOT = Path(__file__).resolve().parents[2]


def _empty_edge_data() -> dict:
    return {
        "upstreams": [], "routes": [], "plugin_configs": [], "global_rules": [],
        "plugin_metadata": [], "stream_proxies": [], "ssl_certificates": [],
        "warnings": [],
    }


def _make_service() -> EdgeImportService:
    client = MagicMock()
    client.list_routes.return_value = []
    client.list_upstreams.return_value = []
    client.list_available_plugins.return_value = []
    return EdgeImportService(
        cluster_id=1, node_id=1, db_session=None,
        ip="127.0.0.1", port=9080, edge_path="/edge",
        client=client, route_info={"route": "direct"},
    )


# ── S1: 部署密钥链 ────────────────────────────────────────────────────


class TestS1DeploymentSecretChain:
    def test_placeholder_blacklist_covers_unit_variant(self):
        """deployment unit 历史内置的占位密钥变体必须命中黑名单。"""
        assert _is_placeholder("your-production-secret-key") is True
        # 既有黑名单成员不回归
        assert _is_placeholder("your-super-secret-key-change-in-production") is True
        assert _is_placeholder("") is True
        assert _is_placeholder("a-real-random-secret") is False

    def test_unit_template_has_no_baked_secret_and_fails_fast(self):
        """unit 模板：不含占位密钥值；显式 APP_ENV=production；密钥走 EnvironmentFile。"""
        unit = (REPO_ROOT / "deployment" / "panshi-backend.service").read_text(encoding="utf-8")
        assert "your-production-secret-key" not in unit, "unit 模板不得内置任何占位密钥值"
        assert "APP_ENV=production" in unit, "unit 必须显式生产模式（缺密钥时 fail-fast）"
        assert "EnvironmentFile" in unit, "密钥必须经环境文件注入而非模板内联"


# ── S2: edge_import 事件循环冻结 + 长期 IO 持锁 ────────────────────────


class TestS2EdgeImportEventLoop:
    async def test_preview_fetch_runs_off_event_loop(self):
        """preview_import 的 fetch_edge_data（同步 httpx）必须在工作线程执行。"""
        svc = _make_service()
        flags: list[bool] = []

        def fake_fetch():
            flags.append(threading.current_thread() is not threading.main_thread())
            return _empty_edge_data()

        svc.fetch_edge_data = fake_fetch
        await svc.preview_import()
        assert flags and all(flags), "fetch_edge_data 在事件循环线程内裸跑（缺 to_thread）"

    async def test_execute_fetch_runs_off_event_loop(self):
        """execute_import 的 fetch_edge_data（同步 httpx）必须在工作线程执行。"""
        svc = _make_service()
        flags: list[bool] = []

        def fake_fetch():
            flags.append(threading.current_thread() is not threading.main_thread())
            return _empty_edge_data()

        svc.fetch_edge_data = fake_fetch
        await svc.execute_import(selections=[], session=AsyncMock())
        assert flags and all(flags), "fetch_edge_data 在事件循环线程内裸跑（缺 to_thread）"

    async def test_service_test_connection_sync_heavy(self):
        """test_connection 是纯同步重 IO 方法（8 次串行 httpx），仅供端点 to_thread 包装。

        本用例钉住其同步本质：方法本身不含 await，端点必须以
        asyncio.to_thread(service.test_connection) 调用（由端点源码守卫用例覆盖）。
        """
        svc = _make_service()
        result = svc.test_connection()
        assert isinstance(result, dict)

    def test_endpoints_commit_before_io_and_offload(self):
        """端点源码守卫：三端点长 IO 前 db.commit()；test_connection 经 to_thread。"""
        api_src = (REPO_ROOT / "backend" / "app" / "api" / "v1" / "edge_import.py").read_text(
            encoding="utf-8"
        )

        def _region(src: str, name: str) -> str:
            start = src.index(f"async def {name}")
            rest = src[start + 1 :]
            nxt = rest.find("async def ")
            return src[start:] if nxt == -1 else src[start : start + 1 + nxt]

        for name, io_marker in [
            ("test_connection", "service.test_connection"),
            ("preview_import", "await service.preview_import"),
            ("execute_import", "await service.execute_import"),
        ]:
            region = _region(api_src, name)
            assert "await db.commit()" in region, f"{name}: 长前 IO 缺 db.commit()（#29 假 401 防护）"
            assert region.index("await db.commit()") < region.index(io_marker), (
                f"{name}: db.commit() 必须先于长 IO（释放 SQLite 写锁）"
            )

        assert "asyncio.to_thread(service.test_connection" in api_src, (
            "test_connection（同步重 IO）必须经 asyncio.to_thread 调用"
        )


# ── S3: 数据库连接测试伪异步 ──────────────────────────────────────────


class TestS3DatabaseConnectionTest:
    async def test_do_test_runs_off_event_loop(self, monkeypatch):
        """_do_test 的同步引擎探测必须在工作线程执行，wait_for(3s) 才可取消。"""
        from app.api.v1 import database as database_api

        flags: list[bool] = []

        def fake_build(conn):
            flags.append(threading.current_thread() is not threading.main_thread())
            engine = MagicMock()
            engine.connect.return_value.__enter__.return_value.execute.return_value = None
            return engine

        monkeypatch.setattr(database_api, "build_sync_engine_for", fake_build)
        ok, detail = await database_api._do_test(MagicMock())
        assert ok is True
        assert flags and all(flags), "同步引擎探测在事件循环线程内裸跑（wait_for 失效）"
