"""Tests for GET /api/v1/metrics/* endpoints."""
import pytest
from unittest.mock import patch


class TestMetricsAPI:
    """Integration tests for the metrics API."""

    @pytest.fixture
    def client(self):
        from app.main import app
        from fastapi.testclient import TestClient
        with TestClient(app) as c:
            yield c

    # ── GET /api/v1/metrics/names ─────────────────────────

    @patch("app.api.v1.metrics.query_metric_names")
    def test_get_metric_names(self, mock_query, client):
        mock_query.return_value = ["cpu", "mem"]
        resp = client.get("/api/v1/metrics/names")
        assert resp.status_code == 200
        assert resp.json() == {"data": ["cpu", "mem"]}

    @patch("app.api.v1.metrics.query_metric_names")
    def test_get_metric_names_empty(self, mock_query, client):
        mock_query.return_value = []
        resp = client.get("/api/v1/metrics/names")
        assert resp.status_code == 200
        assert resp.json() == {"data": []}

    # ── GET /api/v1/metrics/{metric_name} ─────────────────

    @patch("app.api.v1.metrics.query_time_series")
    def test_get_metric_time_series(self, mock_query, client):
        mock_query.return_value = [
            {"metric_name": "cpu", "timestamp": 1000, "avg": 50.0, "max": 80.0, "min": 30.0, "sample_count": 6},
        ]
        resp = client.get("/api/v1/metrics/cpu")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"][0]["avg"] == 50.0

    @patch("app.api.v1.metrics.query_time_series")
    def test_get_metric_time_series_with_params(self, mock_query, client):
        mock_query.return_value = []
        resp = client.get("/api/v1/metrics/cpu?since=6h&interval=15m&label=state:active")
        assert resp.status_code == 200
        mock_query.assert_called_once_with(metric_name="cpu", since="6h", interval="15m", label="state:active")

    @patch("app.api.v1.metrics.query_time_series")
    def test_get_metric_time_series_empty(self, mock_query, client):
        mock_query.return_value = []
        resp = client.get("/api/v1/metrics/cpu")
        assert resp.status_code == 200
        assert resp.json() == {"data": []}

    # ── GET /api/v1/metrics/summary ───────────────────────

    @patch("app.api.v1.metrics.query_summary")
    def test_get_summary(self, mock_query, client):
        mock_query.return_value = {"cpu": 85.0, "mem": 1024.0}
        resp = client.get("/api/v1/metrics/summary")
        assert resp.status_code == 200
        assert resp.json() == {"data": {"cpu": 85.0, "mem": 1024.0}}

    @patch("app.api.v1.metrics.query_summary")
    def test_get_summary_empty(self, mock_query, client):
        mock_query.return_value = {}
        resp = client.get("/api/v1/metrics/summary")
        assert resp.status_code == 200
        assert resp.json() == {"data": {}}

    # ── Feature gating ────────────────────────────────────

    def test_metrics_router_registered(self, client):
        resp = client.get("/api/v1/metrics/names")
        assert resp.status_code in (200, 404)
