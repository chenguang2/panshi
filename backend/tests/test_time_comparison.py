"""Tests for time comparison API endpoint."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


class TestTimeComparisonEndpoint:
    """Tests for GET /api/v1/metrics/time-comparison endpoint."""

    def test_time_comparison_returns_200(self):
        with patch("app.api.v1.metrics.query_time_comparison") as mock_query:
            mock_query.return_value = {}
            response = client.get("/api/v1/metrics/time-comparison")
            assert response.status_code == 200

    def test_time_comparison_returns_data(self):
        with patch("app.api.v1.metrics.query_time_comparison") as mock_query:
            mock_query.return_value = {}
            response = client.get("/api/v1/metrics/time-comparison")
            assert "data" in response.json()

    def test_time_comparison_default_type(self):
        with patch("app.api.v1.metrics.query_time_comparison") as mock_query:
            mock_query.return_value = {}
            client.get("/api/v1/metrics/time-comparison")
            call_kwargs = mock_query.call_args[1]
            assert call_kwargs.get("comparison_type") == "day_over_day"


class TestTimeComparisonData:
    """Tests for time comparison data structure."""

    def test_day_over_day_returns_correct_structure(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.side_effect = [
                [(12500, 1440)],
                [(11800, 1440)],
            ]
            response = client.get("/api/v1/metrics/time-comparison?comparison_type=day_over_day")
            assert response.status_code == 200
            data = response.json()["data"]
            assert "today_requests" in data
            assert "yesterday_requests" in data
            assert "change_rate" in data
            assert "data_quality" in data

    def test_hourly_distribution_returns_list(self):
        with patch("app.services.metrics_service.execute_query") as mock_exec:
            mock_exec.return_value = [
                (1, 1, 100),
                (1, 2, 150),
            ]
            response = client.get("/api/v1/metrics/time-comparison?comparison_type=hourly_distribution")
            assert response.status_code == 200
            data = response.json()["data"]
            assert isinstance(data, list)
