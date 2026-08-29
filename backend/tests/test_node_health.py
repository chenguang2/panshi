"""Tests for node health API endpoint."""
import pytest
from unittest.mock import patch
from tests.api_helpers import AuthedTestClient
from app.main import app


client = AuthedTestClient(app)


class TestNodeHealthEndpoint:
    """Tests for GET /api/v1/metrics/node-health endpoint."""

    def test_node_health_returns_200(self):
        with patch("app.api.v1.metrics.query_node_health") as mock_query:
            mock_query.return_value = []
            response = client.get("/api/v1/metrics/node-health")
            assert response.status_code == 200

    def test_node_health_returns_data_array(self):
        with patch("app.api.v1.metrics.query_node_health") as mock_query:
            mock_query.return_value = []
            response = client.get("/api/v1/metrics/node-health")
            assert "data" in response.json()

    def test_node_health_default_type(self):
        with patch("app.api.v1.metrics.query_node_health") as mock_query:
            mock_query.return_value = []
            client.get("/api/v1/metrics/node-health")
            call_kwargs = mock_query.call_args[1]
            assert call_kwargs.get("health_type") == "status"


class TestNodeHealthData:
    """Tests for node health data structure."""

    def test_health_status_returns_correct_structure(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                ("192.168.100.42", 1.0, "2026-08-21 10:47:42"),
            ]
            response = client.get("/api/v1/metrics/node-health?health_type=status")
            assert response.status_code == 200
            data = response.json()["data"]
            assert len(data) == 1
            assert data[0]["node_ip"] == "192.168.100.42"
            assert data[0]["status"] == 1
            assert "last_seen" in data[0]

    def test_resource_usage_returns_correct_structure(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                ("shared_dict", "192.168.100.42", 104857600, 52428800, 50.0),
            ]
            response = client.get("/api/v1/metrics/node-health?health_type=resource")
            assert response.status_code == 200
            data = response.json()["data"]
            assert len(data) == 1
            assert data[0]["dict_name"] == "shared_dict"
            assert data[0]["node_ip"] == "192.168.100.42"
            assert data[0]["capacity_bytes"] == 104857600
            assert data[0]["free_bytes"] == 52428800
            assert data[0]["usage_percent"] == 50.0
