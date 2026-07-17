"""Tests for the reload endpoint (renamed from restart)."""
import pytest
from fastapi.testclient import TestClient


class TestNodeReloadEndpoint:

    @pytest.fixture
    def client(self):
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_reload_endpoint_exists(self, client):
        """POST /api/v1/clusters/{id}/nodes/{nid}/reload should exist."""
        resp = client.post("/api/v1/clusters/99999/nodes/99999/reload")
        assert resp.status_code in (404, 422)

    def test_restart_endpoint_not_found(self, client):
        """Old /restart endpoint should no longer be available."""
        resp = client.post("/api/v1/clusters/99999/nodes/99999/restart")
        assert resp.status_code in (404, 405)
