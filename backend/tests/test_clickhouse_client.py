"""Tests for ClickHouse connection management."""
import pytest
from unittest.mock import patch, MagicMock


class TestClickHouseClient:
    """Unit tests for app.services.clickhouse_client."""

    def reset_module(self):
        import threading

        import app.services.clickhouse_client as mod
        mod._local = threading.local()
        mod._config = None

    @pytest.fixture(autouse=True)
    def setup(self):
        self.reset_module()
        yield
        self.reset_module()

    # ── load_config ────────────────────────────────────────

    def test_load_config_success(self, tmp_path):
        import yaml
        cfg = tmp_path / "clickhouse.yaml"
        cfg.write_text(yaml.dump({
            "host": "192.168.1.1",
            "port": 9000,
            "database": "test_db",
            "user": "test_user",
            "password": "test_pass",
            "connect_timeout": 10,
        }))

        from app.services.clickhouse_client import _load_config
        config = _load_config(str(cfg))
        assert config["host"] == "192.168.1.1"
        assert config["port"] == 9000
        assert config["database"] == "test_db"
        assert config["connect_timeout"] == 10

    def test_load_config_defaults(self, tmp_path):
        cfg = tmp_path / "clickhouse.yaml"
        cfg.write_text("host: 10.0.0.1\n")

        from app.services.clickhouse_client import _load_config
        config = _load_config(str(cfg))
        assert config["host"] == "10.0.0.1"
        assert config["port"] == 9000
        assert config["database"] == "esapm_metrics"
        assert config["connect_timeout"] == 5

    # ── get_client ─────────────────────────────────────────

    @patch("app.services.clickhouse_client.Client")
    def test_get_client_reuses_connection_within_thread(self, MockClient):
        from app.services.clickhouse_client import get_client, _load_config
        _load_config()  # load defaults
        c1 = get_client()
        c2 = get_client()
        assert c1 is c2
        MockClient.assert_called_once()

    @patch("app.services.clickhouse_client.Client")
    def test_get_client_config_applied(self, MockClient):
        from app.services.clickhouse_client import get_client, _load_config
        _load_config()
        get_client()
        MockClient.assert_called_once_with(
            host="192.168.100.42",
            port=9000,
            database="esapm_metrics",
            user="default",
            password="",
            connect_timeout=5,
            settings={"connect_timeout": 5},
        )

    # ── execute_query ──────────────────────────────────────

    @patch("app.services.clickhouse_client.Client")
    def test_execute_query_returns_results(self, MockClient):
        mock_instance = MagicMock()
        mock_instance.execute.return_value = [(1, "a"), (2, "b")]
        MockClient.return_value = mock_instance

        from app.services.clickhouse_client import execute_query, _load_config
        _load_config()
        result = execute_query("SELECT 1")
        assert result == [(1, "a"), (2, "b")]
        mock_instance.execute.assert_called_once_with("SELECT 1", None)

    @patch("app.services.clickhouse_client.Client")
    def test_execute_query_with_params(self, MockClient):
        mock_instance = MagicMock()
        mock_instance.execute.return_value = [("ok",)]
        MockClient.return_value = mock_instance

        from app.services.clickhouse_client import execute_query, _load_config
        _load_config()
        result = execute_query("SELECT %(val)s", {"val": 42})
        assert result == [("ok",)]
        mock_instance.execute.assert_called_once_with("SELECT %(val)s", {"val": 42})

    @patch("app.services.clickhouse_client.Client")
    def test_execute_query_no_client_returns_none(self, MockClient):
        MockClient.side_effect = Exception("connection refused")

        from app.services.clickhouse_client import execute_query, _load_config
        _load_config()
        result = execute_query("SELECT 1")
        assert result is None

    def test_execute_query_client_init_fails(self, monkeypatch):
        from pathlib import Path
        monkeypatch.setattr("app.services.clickhouse_client._CONFIG_PATH", Path("/tmp/nonexistent/clickhouse.yaml"))
        monkeypatch.setattr("app.services.clickhouse_client._config", None)
        import threading

        monkeypatch.setattr("app.services.clickhouse_client._local", threading.local())
        from app.services.clickhouse_client import execute_query
        result = execute_query("SELECT 1")
        assert result is None


class TestClickHouseClientThreadLocal:
    """线程本地连接：clickhouse_driver 的 Client 非线程安全。

    回归背景：metrics API 改为 asyncio.to_thread 后，多工作线程并发共用
    全局单例 Client（同一条 TCP 连接），协议状态被竞争破坏后查询静默返回空
    （指标下拉变空、无任何报错），直到进程重启才恢复。
    """

    def reset(self):
        import threading
        import app.services.clickhouse_client as mod
        mod._local = threading.local()
        mod._config = None

    @patch("app.services.clickhouse_client.Client")
    def test_each_thread_gets_own_connection(self, MockClient):
        import threading

        # 每次 Client(...) 调用生成独立实例，才能区分"各线程各自创建"
        MockClient.side_effect = MagicMock
        self.reset()
        from app.services.clickhouse_client import get_client, _load_config
        _load_config()

        results = {}
        barrier = threading.Barrier(2)

        def worker():
            barrier.wait(timeout=5)
            c1 = get_client()
            c2 = get_client()
            assert c1 is c2, "同一线程内必须复用同一连接"
            results[threading.get_ident()] = c1

        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        assert len(results) == 2
        a, b = list(results.values())
        assert a is not b, "不同线程必须持有各自独立的连接（不能共享 TCP 连接）"
        assert MockClient.call_count == 2
