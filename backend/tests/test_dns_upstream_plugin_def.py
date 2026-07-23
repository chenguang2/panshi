"""Tests: dns_upstream plugin definition is registered in BUILTIN_PLUGINS
and accessible via the plugins API when whitelisted."""

import pytest
from fastapi.testclient import TestClient

from app.config.plugin_definitions import BUILTIN_PLUGINS


class TestDnsUpstreamPluginDef:
    """dns_upstream MUST be registered as a builtin plugin."""

    def test_plugin_exists(self):
        """BUILTIN_PLUGINS should contain dns_upstream."""
        names = [p["name"] for p in BUILTIN_PLUGINS]
        assert "dns_upstream" in names

    def test_plugin_structure(self):
        """dns_upstream entry should have required fields."""
        plugin = next(p for p in BUILTIN_PLUGINS if p["name"] == "dns_upstream")
        assert plugin["display_name"] == "DNS 上游解析"
        assert plugin["category"] == "process"
        assert plugin["enable_metadata"] is False
        assert plugin["schema"] == {}


class TestDnsUpstreamPluginAPI:
    """dns_upstream MUST be returned by GET /plugins/builtin when whitelisted."""

    @pytest.fixture(autouse=True)
    def configure_features(self):
        import app.core.features as fmod
        fmod._features = {
            "features": {},
            "enabled_plugins": ["proxy_rewrite", "traceid", "dns_upstream"],
        }
        yield
        fmod._features = None

    @pytest.fixture
    def client(self):
        import app.main
        import importlib
        importlib.reload(app.main)
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_builtin_all_returns_dns_upstream(self, client):
        """all=1 should return dns_upstream since it's whitelisted."""
        resp = client.get("/api/v1/plugins/builtin?all=1")
        assert resp.status_code == 200
        data = resp.json()
        names = {p["name"] for p in data["plugins"]}
        assert "dns_upstream" in names

    def test_builtin_without_all_returns_dns_upstream(self, client):
        """Without all=1, dns_upstream should also be present (whitelisted + no DB filter)."""
        resp = client.get("/api/v1/plugins/builtin")
        assert resp.status_code == 200
        data = resp.json()
        names = {p["name"] for p in data["plugins"]}
        assert "dns_upstream" in names
