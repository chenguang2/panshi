import pytest
import os
import tempfile
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services.edge_logger import EdgeLogger, reset_edge_logger


class TestEdgeClientRouteMethods:
    """Test EdgeClient route-related methods"""

    def test_update_route_method_exists(self):
        """Test that update_route method exists on EdgeClient"""
        client = object.__new__(EdgeClient)
        assert hasattr(client, 'update_route')

    def test_delete_route_method_exists(self):
        """Test that delete_route method exists on EdgeClient"""
        client = object.__new__(EdgeClient)
        assert hasattr(client, 'delete_route')

    def test_convert_route_to_edge_format_method_exists(self):
        """Test that convert_route_to_edge_format method exists on EdgeClient"""
        assert hasattr(EdgeClient, 'convert_route_to_edge_format')


class TestConvertRouteToEdgeFormat:
    """Test convert_route_to_edge_format static method"""

    def test_convert_basic_route(self):
        """Test basic route conversion"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-123",
            name="test-route",
            uri="/api/test",
            methods=None,
            hosts=None,
            upstream_edge_uuid=None,
            priority=0,
            vars_json=None,
            plugins=None
        )

        assert result["name"] == "test-route"
        assert result["uri"] == "/api/test"
        assert "methods" not in result
        assert "hosts" not in result
        assert "upstream_id" not in result
        assert "priority" not in result

    def test_convert_route_with_methods_string(self):
        """Test route conversion with methods as comma-separated string"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-456",
            name="method-route",
            uri="/api/method",
            methods="GET,POST",
            hosts=None,
            upstream_edge_uuid=None,
            priority=0,
            vars_json=None,
            plugins=None
        )

        assert result["methods"] == ["GET", "POST"]

    def test_convert_route_with_methods_list(self):
        """Test route conversion with methods as list"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-789",
            name="method-route",
            uri="/api/method",
            methods=["GET", "POST", "DELETE"],
            hosts=None,
            upstream_edge_uuid=None,
            priority=0,
            vars_json=None,
            plugins=None
        )

        assert result["methods"] == ["GET", "POST", "DELETE"]

    def test_convert_route_with_hosts_string(self):
        """Test route conversion with hosts as comma-separated string"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-host",
            name="host-route",
            uri="/api/host",
            methods=None,
            hosts="example.com,www.example.com",
            upstream_edge_uuid=None,
            priority=0,
            vars_json=None,
            plugins=None
        )

        assert result["hosts"] == ["example.com", "www.example.com"]

    def test_convert_route_with_hosts_list(self):
        """Test route conversion with hosts as list"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-host-list",
            name="host-route",
            uri="/api/host",
            methods=None,
            hosts=["example.com", "www.example.com"],
            upstream_edge_uuid=None,
            priority=0,
            vars_json=None,
            plugins=None
        )

        assert result["hosts"] == ["example.com", "www.example.com"]

    def test_convert_route_with_upstream(self):
        """Test route conversion with upstream_edge_uuid"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-upstream",
            name="upstream-route",
            uri="/api/upstream",
            methods=None,
            hosts=None,
            upstream_edge_uuid="upstream-uuid-123",
            priority=0,
            vars_json=None,
            plugins=None
        )

        assert result["upstream_id"] == "upstream-uuid-123"

    def test_convert_route_with_priority(self):
        """Test route conversion with priority"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-priority",
            name="priority-route",
            uri="/api/priority",
            methods=None,
            hosts=None,
            upstream_edge_uuid=None,
            priority=100,
            vars_json=None,
            plugins=None
        )

        assert result["priority"] == 100

    def test_convert_route_with_vars_json(self):
        """Test route conversion with vars JSON string"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-vars",
            name="vars-route",
            uri="/api/vars",
            methods=None,
            hosts=None,
            upstream_edge_uuid=None,
            priority=0,
            vars_json='[["var_name","==","test_value"]]',
            plugins=None
        )

        assert result["vars"] == [["var_name", "==", "test_value"]]

    def test_convert_route_with_invalid_vars_json(self):
        """Test route conversion with invalid vars JSON"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-invalid-vars",
            name="invalid-vars-route",
            uri="/api/invalid-vars",
            methods=None,
            hosts=None,
            upstream_edge_uuid=None,
            priority=0,
            vars_json='not valid json',
            plugins=None
        )

        assert "vars" not in result

    def test_convert_route_with_plugins_list(self):
        """Test route conversion with plugins as list of dicts"""
        plugins = [
            {"plugin_name": "rate-limit", "config": '{"rejected_code": 429}'},
            {"plugin_name": "cors", "config": '{"allow_origins": "*"}'}
        ]
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-plugins",
            name="plugins-route",
            uri="/api/plugins",
            methods=None,
            hosts=None,
            upstream_edge_uuid=None,
            priority=0,
            vars_json=None,
            plugins=plugins
        )

        assert "plugins" in result
        assert result["plugins"]["rate-limit"] == {"rejected_code": 429}
        assert result["plugins"]["cors"] == {"allow_origins": "*"}

    def test_convert_route_with_empty_plugins(self):
        """Test route conversion with empty plugins list"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-empty-plugins",
            name="empty-plugins-route",
            uri="/api/empty-plugins",
            methods=None,
            hosts=None,
            upstream_edge_uuid=None,
            priority=0,
            vars_json=None,
            plugins=[]
        )

        assert "plugins" not in result

    def test_convert_route_priority_zero_not_included(self):
        """Test that priority 0 is not included in output"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-zero",
            name="zero-priority-route",
            uri="/api/zero",
            methods=None,
            hosts=None,
            upstream_edge_uuid=None,
            priority=0,
            vars_json=None,
            plugins=None
        )

        assert "priority" not in result

    def test_convert_route_priority_non_zero_included(self):
        """Test that non-zero priority is included in output"""
        result = EdgeClient.convert_route_to_edge_format(
            edge_uuid="route-uuid-nonzero",
            name="nonzero-priority-route",
            uri="/api/nonzero",
            methods=None,
            hosts=None,
            upstream_edge_uuid=None,
            priority=1,
            vars_json=None,
            plugins=None
        )

        assert result["priority"] == 1


class TestEdgeLoggerRouteOperation:
    """Test EdgeLogger log_route_operation method"""

    def test_log_route_operation_creates_file(self):
        """Test that log_route_operation creates route.log file"""
        with tempfile.TemporaryDirectory() as tmpdir:
            reset_edge_logger()
            logger = EdgeLogger()
            logger.LOG_DIR = os.path.join(tmpdir, "logs", "edge")
            logger.UPSTREAM_LOG_FILE = os.path.join(logger.LOG_DIR, "upstream.log")
            logger.ROUTE_LOG_FILE = os.path.join(logger.LOG_DIR, "route.log")
            os.makedirs(logger.LOG_DIR, exist_ok=True)

            logger.log_route_operation(
                cluster_id=1,
                cluster_name="test-cluster",
                route_id=100,
                route_name="test-route",
                method="PUT",
                path="/edge/admin/routes/route-uuid-123",
                request_body={"name": "test-route", "uri": "/api/test"},
                encrypted_body="abc123",
                response_status=201,
                response_body={"action": "update"},
                status="SUCCESS"
            )

            assert os.path.exists(logger.ROUTE_LOG_FILE)
            with open(logger.ROUTE_LOG_FILE, "r", encoding="utf-8") as f:
                content = f.read()
                assert "test-cluster" in content
                assert "test-route" in content
                assert "Route:test-route (ID:100)" in content
                assert "SUCCESS" in content
                assert "/edge/admin/routes/route-uuid-123" in content

    def test_log_route_operation_error_entry(self):
        """Test log_route_operation with error"""
        with tempfile.TemporaryDirectory() as tmpdir:
            reset_edge_logger()
            logger = EdgeLogger()
            logger.LOG_DIR = os.path.join(tmpdir, "logs", "edge")
            logger.UPSTREAM_LOG_FILE = os.path.join(logger.LOG_DIR, "upstream.log")
            logger.ROUTE_LOG_FILE = os.path.join(logger.LOG_DIR, "route.log")
            os.makedirs(logger.LOG_DIR, exist_ok=True)

            logger.log_route_operation(
                cluster_id=1,
                cluster_name="test-cluster",
                route_id=100,
                route_name="test-route",
                method="PUT",
                path="/edge/admin/routes/route-uuid-123",
                request_body={"name": "test-route"},
                encrypted_body=None,
                response_status=None,
                response_body=None,
                status="FAILED",
                error="Connection timeout"
            )

            with open(logger.ROUTE_LOG_FILE, "r", encoding="utf-8") as f:
                content = f.read()
                assert "FAILED" in content
                assert "Connection timeout" in content

    def test_log_route_operation_does_not_write_to_upstream_log(self):
        """Test that log_route_operation does not write to upstream.log"""
        with tempfile.TemporaryDirectory() as tmpdir:
            reset_edge_logger()
            logger = EdgeLogger()
            logger.LOG_DIR = os.path.join(tmpdir, "logs", "edge")
            logger.UPSTREAM_LOG_FILE = os.path.join(logger.LOG_DIR, "upstream.log")
            logger.ROUTE_LOG_FILE = os.path.join(logger.LOG_DIR, "route.log")
            os.makedirs(logger.LOG_DIR, exist_ok=True)

            logger.log_route_operation(
                cluster_id=1,
                cluster_name="test-cluster",
                route_id=100,
                route_name="test-route",
                method="PUT",
                path="/edge/admin/routes/route-uuid-123",
                request_body={"name": "test-route"},
                encrypted_body=None,
                response_status=201,
                response_body={"action": "update"},
                status="SUCCESS"
            )

            assert not os.path.exists(logger.UPSTREAM_LOG_FILE)

    def test_log_route_operation_with_delete_method(self):
        """Test log_route_operation with DELETE method"""
        with tempfile.TemporaryDirectory() as tmpdir:
            reset_edge_logger()
            logger = EdgeLogger()
            logger.LOG_DIR = os.path.join(tmpdir, "logs", "edge")
            logger.UPSTREAM_LOG_FILE = os.path.join(logger.LOG_DIR, "upstream.log")
            logger.ROUTE_LOG_FILE = os.path.join(logger.LOG_DIR, "route.log")
            os.makedirs(logger.LOG_DIR, exist_ok=True)

            logger.log_route_operation(
                cluster_id=1,
                cluster_name="delete-cluster",
                route_id=200,
                route_name="delete-route",
                method="DELETE",
                path="/edge/admin/routes/route-uuid-delete",
                request_body=None,
                encrypted_body=None,
                response_status=204,
                response_body=None,
                status="SUCCESS"
            )

            with open(logger.ROUTE_LOG_FILE, "r", encoding="utf-8") as f:
                content = f.read()
                assert "DELETE" in content
                assert "delete-route" in content
                assert "204" in content