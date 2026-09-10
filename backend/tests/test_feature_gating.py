"""Tests for conditional router registration based on feature flags."""

import importlib
import pytest
import yaml
from fastapi.testclient import TestClient


def _route_exists(app, method: str, path: str) -> bool:
    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            if method.upper() in route.methods and route.path == path:
                return True
    return False


class TestFeatureGating:
    """When a feature is disabled, its routes should not be registered."""

    @pytest.fixture(autouse=True)
    def configure_features(self, tmp_path, monkeypatch):
        """用临时 features.yaml 隔离（get_features 有 mtime 热重载，直接改 _features 会被真实配置覆盖）。"""
        import app.core.features as fmod
        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {
                "edge_client": False,
                "edge_import": True,
                "install_openresty": False,
                "install_edge": True,
                "plugin_switches": True,
            },
            "enabled_plugins": [],
        }))
        fmod._features = None
        fmod._features_mtime = 0.0
        monkeypatch.setattr(fmod, "_FEATURES_PATH", cfg)
        yield
        fmod._features = None
        fmod._features_mtime = 0.0

    @pytest.fixture
    def client(self):
        import app.main
        importlib.reload(app.main)
        with TestClient(app.main.app) as c:
            self._app = app.main.app
            yield c

    # ── Disabled → route NOT registered ────────────────

    def test_edge_client_disabled_route_absent(self, client):
        assert not _route_exists(self._app, "GET", "/api/v1/edge-client/nodes")

    def test_install_openresty_disabled_route_absent(self, client):
        assert not _route_exists(self._app, "POST", "/api/v1/clusters/{cluster_id}/nodes/{node_id}/install-openresty")

    def test_cancel_install_disabled_route_absent(self, client):
        assert not _route_exists(self._app, "POST", "/api/v1/clusters/{cluster_id}/nodes/{node_id}/cancel-install")

    # ── Enabled → route IS registered ──────────────────

    def test_edge_import_enabled_route_present(self, client):
        assert _route_exists(self._app, "POST", "/api/v1/edge-import/test-connection")

    def test_install_edge_enabled_route_present(self, client):
        assert _route_exists(self._app, "POST", "/api/v1/clusters/{cluster_id}/nodes/{node_id}/install-edge")

    def test_plugin_switches_enabled_route_present(self, client):
        assert _route_exists(self._app, "GET", "/api/v1/plugin-switches")

    # ── Core routes always present ─────────────────────

    def test_core_start_route_always_present(self, client):
        assert _route_exists(self._app, "POST", "/api/v1/clusters/{cluster_id}/nodes/{node_id}/start")
