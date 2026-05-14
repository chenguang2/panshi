"""Test EdgeLogger publish logging for plugin_config, global_rule, plugin_metadata."""
import json
from unittest.mock import patch, call
from app.services.edge_logger import EdgeLogger, get_edge_logger, reset_edge_logger


class TestEdgeLoggerPublishLogging:
    """Test the three new EdgeLogger publish logging methods."""

    def setup_method(self):
        reset_edge_logger()

    # ─── log_plugin_config_operation ──────────────────────────

    def test_log_plugin_config_operation_success(self, tmp_path):
        log_file = tmp_path / "plugin_config.log"
        logger = EdgeLogger()
        logger.PLUGIN_CONFIG_LOG_FILE = str(log_file)

        logger.log_plugin_config_operation(
            cluster_id=1,
            cluster_name="test-cluster",
            config_id=42,
            config_name="my-plugin-config",
            method="PUT",
            path="/edge/admin/plugin_configs/uuid-123",
            request_body={"desc": "my-plugin-config", "plugins": {"key-auth": {}}},
            encrypted_body="encrypted-base64-string",
            response_status=201,
            response_body={"status": "ok"},
            status="SUCCESS"
        )

        content = log_file.read_text(encoding="utf-8")
        assert "PluginConfig:my-plugin-config (ID:42)" in content
        assert "Cluster:test-cluster (ID:1)" in content
        assert "Request: PUT /edge/admin/plugin_configs/uuid-123" in content
        assert "Request Body:" in content
        assert "Encrypted: encrypted-base64-string" in content
        assert "Response: 201" in content
        assert "Response Body:" in content
        assert "Status: SUCCESS" in content
        assert "---" in content

    def test_log_plugin_config_operation_error(self, tmp_path):
        log_file = tmp_path / "plugin_config.log"
        logger = EdgeLogger()
        logger.PLUGIN_CONFIG_LOG_FILE = str(log_file)

        logger.log_plugin_config_operation(
            cluster_id=1,
            cluster_name="test-cluster",
            config_id=42,
            config_name="my-plugin-config",
            method="PUT",
            path="/edge/admin/plugin_configs/uuid-123",
            request_body={"desc": "my-plugin-config", "plugins": {"key-auth": {}}},
            encrypted_body=None,
            response_status=None,
            response_body=None,
            status="FAILED",
            error="Connection refused"
        )

        content = log_file.read_text(encoding="utf-8")
        assert "Status: FAILED" in content
        assert "Error: Connection refused" in content
        assert "Encrypted:" not in content
        assert "Response Body:" not in content

    # ─── log_global_rule_operation ────────────────────────────

    def test_log_global_rule_operation_success(self, tmp_path):
        log_file = tmp_path / "global_rule.log"
        logger = EdgeLogger()
        logger.GLOBAL_RULE_LOG_FILE = str(log_file)

        logger.log_global_rule_operation(
            cluster_id=2,
            cluster_name="prod-cluster",
            rule_id=7,
            rule_name="rate-limit-rule",
            method="PUT",
            path="/edge/admin/global_rules/uuid-456",
            request_body={"desc": "rate-limit-rule", "plugins": {"rate-limit": {}}},
            encrypted_body="abcd1234",
            response_status=201,
            response_body={"status": "created"},
            status="SUCCESS"
        )

        content = log_file.read_text(encoding="utf-8")
        assert "GlobalRule:rate-limit-rule (ID:7)" in content
        assert "Cluster:prod-cluster (ID:2)" in content
        assert "Request: PUT /edge/admin/global_rules/uuid-456" in content
        assert "Response Body:" in content
        assert "Status: SUCCESS" in content

    def test_log_global_rule_operation_with_raw_response(self, tmp_path):
        """Decrypted raw_response should appear in log."""
        log_file = tmp_path / "global_rule.log"
        logger = EdgeLogger()
        logger.GLOBAL_RULE_LOG_FILE = str(log_file)

        logger.log_global_rule_operation(
            cluster_id=2,
            cluster_name="prod-cluster",
            rule_id=7,
            rule_name="rate-limit-rule",
            method="PUT",
            path="/edge/admin/global_rules/uuid-456",
            request_body={"desc": "test"},
            encrypted_body=None,
            response_status=200,
            response_body={"raw_response": "invalid-base64-for-decrypt"},
            status="SUCCESS"
        )

        content = log_file.read_text(encoding="utf-8")
        assert "Response Body: (encrypted, decryption failed)" in content

    # ─── log_plugin_metadata_operation ────────────────────────

    def test_log_plugin_metadata_operation_success(self, tmp_path):
        log_file = tmp_path / "plugin_metadata.log"
        logger = EdgeLogger()
        logger.PLUGIN_METADATA_LOG_FILE = str(log_file)

        logger.log_plugin_metadata_operation(
            cluster_id=3,
            cluster_name="dev-cluster",
            plugin_name="key-auth",
            method="PUT",
            path="/edge/admin/plugin_metadata/key-auth",
            request_body={"foo": "bar"},
            encrypted_body="xyz789",
            response_status=201,
            response_body={"status": "ok"},
            status="SUCCESS"
        )

        content = log_file.read_text(encoding="utf-8")
        assert "PluginMetadata:key-auth" in content
        assert "Cluster:dev-cluster (ID:3)" in content
        assert "Request: PUT /edge/admin/plugin_metadata/key-auth" in content
        assert "Response Body:" in content
        assert "Status: SUCCESS" in content

    def test_log_plugin_metadata_operation_error(self, tmp_path):
        log_file = tmp_path / "plugin_metadata.log"
        logger = EdgeLogger()
        logger.PLUGIN_METADATA_LOG_FILE = str(log_file)

        logger.log_plugin_metadata_operation(
            cluster_id=3,
            cluster_name="dev-cluster",
            plugin_name="key-auth",
            method="PUT",
            path="/edge/admin/plugin_metadata/key-auth",
            request_body={"foo": "bar"},
            encrypted_body=None,
            response_status=None,
            response_body=None,
            status="FAILED",
            error="Timeout"
        )

        content = log_file.read_text(encoding="utf-8")
        assert "Status: FAILED" in content
        assert "Error: Timeout" in content
        assert "Encrypted:" not in content

    # ─── singleton / reset ────────────────────────────────────

    def test_get_edge_logger_returns_singleton(self):
        logger1 = get_edge_logger()
        logger2 = get_edge_logger()
        assert logger1 is logger2

    def test_reset_edge_logger_clears_singleton(self):
        logger1 = get_edge_logger()
        reset_edge_logger()
        logger2 = get_edge_logger()
        assert logger1 is not logger2

    # ─── log directory auto-created ───────────────────────────

    def test_log_dir_created_on_init(self, tmp_path):
        log_dir = tmp_path / "custom_logs"
        with patch("app.services.edge_logger.EdgeLogger.LOG_DIR", str(log_dir)):
            logger = object.__new__(EdgeLogger)
            logger.LOG_DIR = str(log_dir)
            logger.UPSTREAM_LOG_FILE = str(log_dir / "upstream.log")
            logger.ROUTE_LOG_FILE = str(log_dir / "route.log")
            logger.PLUGIN_CONFIG_LOG_FILE = str(log_dir / "plugin_config.log")
            logger.GLOBAL_RULE_LOG_FILE = str(log_dir / "global_rule.log")
            logger.PLUGIN_METADATA_LOG_FILE = str(log_dir / "plugin_metadata.log")
            logger.__init__()
            assert log_dir.exists()

    # ─── content isolation between calls ──────────────────────

    def test_multiple_calls_appended_to_same_file(self, tmp_path):
        log_file = tmp_path / "plugin_config.log"
        logger = EdgeLogger()
        logger.PLUGIN_CONFIG_LOG_FILE = str(log_file)

        logger.log_plugin_config_operation(
            cluster_id=1, cluster_name="c1", config_id=1,
            config_name="cfg1", method="PUT", path="/p1",
            request_body=None, encrypted_body=None,
            response_status=200, response_body=None, status="OK"
        )
        logger.log_plugin_config_operation(
            cluster_id=1, cluster_name="c1", config_id=2,
            config_name="cfg2", method="PUT", path="/p2",
            request_body=None, encrypted_body=None,
            response_status=200, response_body=None, status="OK"
        )

        lines = log_file.read_text(encoding="utf-8").strip().split("\n")
        # Each log entry is a block of lines separated by "---"
        assert lines.count("---") == 2
        assert "cfg1" in log_file.read_text(encoding="utf-8")
        assert "cfg2" in log_file.read_text(encoding="utf-8")
