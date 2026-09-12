"""Tests for status analysis API endpoint."""
import pytest
from unittest.mock import patch


class TestStatusAnalysisEndpoint:
    """Tests for GET /api/v1/metrics/status-analysis endpoint."""

    def test_status_analysis_returns_200(self, isolated_app):
        with patch("app.api.v1.metrics.query_status_analysis") as mock_query:
            mock_query.return_value = []
            response = isolated_app.get("/api/v1/metrics/status-analysis")
            assert response.status_code == 200

    def test_status_analysis_returns_data_array(self, isolated_app):
        with patch("app.api.v1.metrics.query_status_analysis") as mock_query:
            mock_query.return_value = []
            response = isolated_app.get("/api/v1/metrics/status-analysis")
            assert "data" in response.json()

    def test_status_analysis_default_since(self, isolated_app):
        with patch("app.api.v1.metrics.query_status_analysis") as mock_query:
            mock_query.return_value = []
            isolated_app.get("/api/v1/metrics/status-analysis")
            call_kwargs = mock_query.call_args[1]
            assert call_kwargs.get("since") == "24h"


class TestStatusAnalysisData:
    """Tests for status analysis data structure."""

    def test_status_analysis_returns_correct_structure(self, isolated_app):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                ("2xx", 1000),
                ("4xx", 150),
                ("其他", 20),
            ]
            response = isolated_app.get("/api/v1/metrics/status-analysis")
            assert response.status_code == 200
            data = response.json()["data"]
            assert len(data) == 3
            assert data[0]["status_class"] == "2xx"
            assert data[0]["request_count"] == 1000
            assert abs(data[0]["percentage"] - 85.47) < 0.01

    def test_status_analysis_empty_result(self, isolated_app):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = []
            response = isolated_app.get("/api/v1/metrics/status-analysis")
            assert response.status_code == 200
            assert response.json()["data"] == []
