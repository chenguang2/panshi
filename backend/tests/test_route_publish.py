import pytest
import os
import tempfile
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services.edge_logger import EdgeLogger, reset_edge_logger


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

    _ABSENT = object()

    @pytest.mark.parametrize(
        ("overrides", "expect_key", "expected"),
        [
            ({"methods": "GET,POST"}, "methods", ["GET", "POST"]),
            ({"methods": ["GET", "POST", "DELETE"]}, "methods", ["GET", "POST", "DELETE"]),
            ({"hosts": "example.com,www.example.com"}, "hosts", ["example.com", "www.example.com"]),
            ({"hosts": ["example.com", "www.example.com"]}, "hosts", ["example.com", "www.example.com"]),
            ({"upstream_edge_uuid": "upstream-uuid-123"}, "upstream_id", "upstream-uuid-123"),
            ({"priority": 100}, "priority", 100),
            ({"priority": 1}, "priority", 1),
            ({"priority": 0}, "priority", _ABSENT),
            ({"vars_json": '[["var_name","==","test_value"]]'}, "vars", [["var_name", "==", "test_value"]]),
            ({"vars_json": "not valid json"}, "vars", _ABSENT),
            ({"plugins": [
                {"plugin_name": "rate-limit", "config": '{"rejected_code": 429}'},
                {"plugin_name": "cors", "config": '{"allow_origins": "*"}'},
            ]}, "plugins", {"rate-limit": {"rejected_code": 429}, "cors": {"allow_origins": "*"}}),
            ({"plugins": []}, "plugins", _ABSENT),
        ],
        ids=["methods-str", "methods-list", "hosts-str", "hosts-list", "upstream",
             "priority-nonzero", "priority-one", "priority-zero-omitted",
             "vars-json", "vars-invalid-omitted", "plugins-list", "plugins-empty-omitted"],
    )
    def test_convert_route_field_variants(self, overrides, expect_key, expected):
        """单字段变体（合并 12 个逐字段用例）：字段按类型解析，空值/零值不输出。"""
        kwargs = dict(
            edge_uuid="route-uuid-x",
            name="route",
            uri="/api/x",
            methods=None,
            hosts=None,
            upstream_edge_uuid=None,
            priority=0,
            vars_json=None,
            plugins=None,
        )
        kwargs.update(overrides)
        result = EdgeClient.convert_route_to_edge_format(**kwargs)
        if expected is self._ABSENT:
            assert expect_key not in result
        else:
            assert result[expect_key] == expected


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