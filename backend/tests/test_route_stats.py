"""Tests for route statistics API endpoint."""
import pytest
from unittest.mock import patch, MagicMock
from tests.api_helpers import AuthedTestClient
from app.main import app


client = AuthedTestClient(app)


class TestRouteStatsEndpoint:
    """Tests for GET /api/v1/metrics/route-stats endpoint."""

    def test_route_stats_returns_200(self):
        with patch("app.api.v1.metrics.query_route_stats") as mock_query:
            mock_query.return_value = []
            response = client.get("/api/v1/metrics/route-stats")
            assert response.status_code == 200

    def test_route_stats_returns_data_array(self):
        with patch("app.api.v1.metrics.query_route_stats") as mock_query:
            mock_query.return_value = []
            response = client.get("/api/v1/metrics/route-stats")
            assert "data" in response.json()

    def test_route_stats_default_type_is_qps(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = []
            response = client.get("/api/v1/metrics/route-stats")
            assert response.status_code == 200
            call_args = mock_exec.call_args[0][0]
            assert "edge_http_status" in call_args

    def test_route_stats_invalid_type_returns_400(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = []
            response = client.get("/api/v1/metrics/route-stats?stats_type=invalid")
            assert response.status_code == 400
            assert "Invalid type" in response.json()["detail"]

    def test_route_stats_with_since_parameter(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = []
            response = client.get("/api/v1/metrics/route-stats?since=24h")
            assert response.status_code == 200
            call_params = mock_exec.call_args[0][1]
            assert call_params["since"] == 86400

    def test_route_stats_with_limit_parameter(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = []
            response = client.get("/api/v1/metrics/route-stats?limit=20")
            assert response.status_code == 200
            call_params = mock_exec.call_args[0][1]
            assert call_params["limit"] == 20

    def test_route_stats_limit_max_100(self):
        response = client.get("/api/v1/metrics/route-stats?limit=200")
        assert response.status_code == 422


class TestRouteQPS:
    """Tests for route QPS statistics."""

    def test_qps_returns_correct_structure(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                ("route-123", "/", 10.5, 1000, 60),
            ]
            response = client.get("/api/v1/metrics/route-stats?stats_type=qps")
            assert response.status_code == 200
            data = response.json()["data"]
            assert len(data) == 1
            assert data[0]["route_id"] == "route-123"
            assert data[0]["uri"] == "/"
            assert data[0]["requests_per_sec"] == 10.5
            assert data[0]["total_requests"] == 1000
            assert data[0]["sample_count"] == 60

    def test_qps_empty_result(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = []
            response = client.get("/api/v1/metrics/route-stats?stats_type=qps")
            assert response.status_code == 200
            assert response.json()["data"] == []


class TestRouteBandwidth:
    """Tests for route bandwidth statistics."""

    def test_bandwidth_returns_correct_structure(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                ("route-123", "/api/test", "ingress", 1024.0, 102400),
            ]
            response = client.get("/api/v1/metrics/route-stats?stats_type=bandwidth")
            assert response.status_code == 200
            data = response.json()["data"]
            assert len(data) == 1
            assert data[0]["route_id"] == "route-123"
            assert data[0]["direction"] == "ingress"
            assert data[0]["bytes_per_sec"] == 1024.0
            assert data[0]["total_bytes"] == 102400


class TestRouteErrorRate:
    """Tests for route error rate statistics."""

    def test_error_rate_returns_correct_structure(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                ("route-123", "/", 10, 5, 1000, 60),
            ]
            response = client.get("/api/v1/metrics/route-stats?stats_type=error_rate")
            assert response.status_code == 200
            data = response.json()["data"]
            assert len(data) == 1
            assert data[0]["route_id"] == "route-123"
            assert data[0]["client_errors"] == 10
            assert data[0]["server_errors"] == 5
            assert data[0]["total_requests"] == 1000
            assert data[0]["error_rate_pct"] == 1.5

    def test_error_rate_zero_requests(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                ("route-123", "/", 0, 0, 0, 1),
            ]
            response = client.get("/api/v1/metrics/route-stats?stats_type=error_rate")
            assert response.status_code == 200
            data = response.json()["data"]
            assert data[0]["error_rate_pct"] == 0.0


class TestRouteLatency:
    """Tests for route latency statistics."""

    def test_latency_returns_correct_structure(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                ("route-123", "/api/test", "request", 12.5, 45.2, 60),
            ]
            response = client.get("/api/v1/metrics/route-stats?stats_type=latency")
            assert response.status_code == 200
            data = response.json()["data"]
            assert len(data) == 1
            assert data[0]["route_id"] == "route-123"
            assert data[0]["latency_type"] == "request"
            assert data[0]["avg_latency_ms"] == 12.5
            assert data[0]["max_latency_ms"] == 45.2
            assert data[0]["sample_count"] == 60

    def test_latency_with_custom_type(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                ("route-123", "/api/test", "upstream", 8.0, 30.0, 60),
            ]
            response = client.get("/api/v1/metrics/route-stats?stats_type=latency&latency_type=upstream")
            assert response.status_code == 200
            call_params = mock_exec.call_args[0][1]
            assert call_params["latency_type"] == "upstream"
