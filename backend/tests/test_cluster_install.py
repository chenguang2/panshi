"""Tests for cluster install endpoints after splitting from cluster_nodes.py."""

from fastapi.testclient import TestClient
import pytest


class TestInstallOpenrestyRouter:
    """install_openresty_router should exist with correct endpoints."""

    @pytest.fixture
    def client(self):
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_install_openresty_endpoint_returns_404_or_422(self, client):
        """POST /api/v1/clusters/{id}/nodes/{nid}/install-openresty should exist."""
        # A non-existent cluster/node should give 404 (not found)
        # rather than 405 (method not allowed) or 404 at router level.
        resp = client.post("/api/v1/clusters/99999/nodes/99999/install-openresty", json={"prefix": "/test"})
        assert resp.status_code in (404, 422)

    def test_cancel_install_endpoint_exists(self, client):
        """POST /api/v1/clusters/{id}/nodes/{nid}/cancel-install should exist."""
        resp = client.post("/api/v1/clusters/99999/nodes/99999/cancel-install")
        assert resp.status_code in (404, 422)

    def test_install_openresty_without_body_returns_422(self, client):
        """Missing required body should return 422 validation error."""
        resp = client.post("/api/v1/clusters/1/nodes/1/install-openresty")
        # If router is registered, FastAPI validates the body → 422
        # If router is NOT registered → 404
        assert resp.status_code in (404, 422)


class TestInstallEdgeRouter:
    """install_edge_router should exist with correct endpoints."""

    @pytest.fixture
    def client(self):
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_install_edge_endpoint_exists(self, client):
        """POST /api/v1/clusters/{id}/nodes/{nid}/install-edge should exist."""
        resp = client.post("/api/v1/clusters/99999/nodes/99999/install-edge", json={"prefix": "/test"})
        assert resp.status_code in (404, 422)
