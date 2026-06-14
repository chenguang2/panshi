"""Tests for plugins.py feature-config whitelist filtering."""

import pytest
from fastapi.testclient import TestClient


class TestPluginWhitelist:
    """enabled_plugins in features.yaml should filter GET /plugins/builtin."""

    @pytest.fixture(autouse=True)
    def configure_features(self):
        import app.core.features as fmod
        fmod._features = {
            "features": {},
            "enabled_plugins": ["proxy_rewrite", "cors", "key_auth", "traceid"],
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

    def test_whitelist_with_all_returns_only_whitelisted(self, client):
        """all=1 should respect whitelist even without DB filter."""
        resp = client.get("/api/v1/plugins/builtin?all=1")
        assert resp.status_code == 200
        data = resp.json()
        names = {p["name"] for p in data["plugins"]}
        assert "proxy_rewrite" in names
        assert "traceid" in names
        # cors is in whitelist but enabled=0 in DB — with all=1, DB is skipped
        assert "cors" in names
        # Not in whitelist → absent even with all=1
        assert "monitor" not in names
        assert "data_center" not in names

    def test_whitelist_without_all_combines_with_db(self, client):
        """Without all=1, whitelist AND DB filter apply."""
        resp = client.get("/api/v1/plugins/builtin")
        assert resp.status_code == 200
        data = resp.json()
        names = {p["name"] for p in data["plugins"]}
        # proxy_rewrite is in whitelist AND enabled in DB
        assert "proxy_rewrite" in names
        # cors is in whitelist BUT disabled in DB → excluded
        assert "cors" not in names
        # Not in whitelist → absent
        assert "monitor" not in names
