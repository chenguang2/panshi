"""Tests for ClickHouse connection management."""
import pytest
from unittest.mock import patch, MagicMock


class TestClickHouseClient:
    """Unit tests for app.services.clickhouse_client."""

    def reset_module(self):
        import app.services.clickhouse_client as mod
        mod._client = None
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
    def test_get_client_creates_once(self, MockClient):
        from app.services.clickhouse_client import get_client, _load_config, _client
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
        monkeypatch.setattr("app.services.clickhouse_client._client", None)
        from app.services.clickhouse_client import execute_query
        result = execute_query("SELECT 1")
        assert result is None
