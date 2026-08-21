"""Tests for status analysis API endpoint."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


class TestStatusAnalysisEndpoint:
    """Tests for GET /api/v1/metrics/status-analysis endpoint."""

    def test_status_analysis_returns_200(self):
        with patch("app.api.v1.metrics.query_status_analysis") as mock_query:
            mock_query.return_value = []
            response = client.get("/api/v1/metrics/status-analysis")
            assert response.status_code == 200

    def test_status_analysis_returns_data_array(self):
        with patch("app.api.v1.metrics.query_status_analysis") as mock_query:
            mock_query.return_value = []
            response = client.get("/api/v1/metrics/status-analysis")
            assert "data" in response.json()

    def test_status_analysis_default_since(self):
        with patch("app.api.v1.metrics.query_status_analysis") as mock_query:
            mock_query.return_value = []
            client.get("/api/v1/metrics/status-analysis")
            call_kwargs = mock_query.call_args[1]
            assert call_kwargs.get("since") == "24h"


class TestStatusAnalysisData:
    """Tests for status analysis data structure."""

    def test_status_analysis_returns_correct_structure(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                ("2xx", 1000),
                ("4xx", 150),
                ("其他", 20),
            ]
            response = client.get("/api/v1/metrics/status-analysis")
            assert response.status_code == 200
            data = response.json()["data"]
            assert len(data) == 3
            assert data[0]["status_class"] == "2xx"
            assert data[0]["request_count"] == 1000
            assert abs(data[0]["percentage"] - 85.47) < 0.01

    def test_status_analysis_empty_result(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = []
            response = client.get("/api/v1/metrics/status-analysis")
            assert response.status_code == 200
            assert response.json()["data"] == []
