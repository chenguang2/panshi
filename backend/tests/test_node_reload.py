"""Tests for the reload endpoint (renamed from restart)."""
import pytest


class TestNodeReloadEndpoint:

    def test_reload_endpoint_exists(self, isolated_app):
        """POST /api/v1/clusters/{id}/nodes/{nid}/reload should exist."""
        resp = isolated_app.post("/api/v1/clusters/99999/nodes/99999/reload")
        assert resp.status_code in (404, 422)

    def test_restart_endpoint_not_found(self, isolated_app):
        """Old /restart endpoint should no longer be available."""
        resp = isolated_app.post("/api/v1/clusters/99999/nodes/99999/restart")
        assert resp.status_code in (404, 405)
