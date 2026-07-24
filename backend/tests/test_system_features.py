"""Tests for GET /api/v1/system/features endpoint and feature-gated routes."""

import json
import tempfile
from pathlib import Path
import pytest
import yaml


class TestSystemFeaturesEndpoint:
    """Integration tests for the system features API."""

    @pytest.fixture(autouse=True)
    def reset_and_configure(self, tmp_path: Path):
        """Reset features module and point it at a temp file before each test."""
        import app.core.features as fmod
        fmod._features = None

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {"edge_client": False, "tools": True},
            "enabled_plugins": ["proxy_rewrite"],
        }))
        self._config_path = str(cfg)

        # Monkey-patch load_features to use our temp file
        self._orig_load = fmod.load_features
        fmod.load_features = lambda path=None: self._orig_load(self._config_path)  # noqa: ARG005
        yield
        fmod.load_features = self._orig_load
        fmod._features = None

    @pytest.fixture
    def client(self):
        """Create a test client for the FastAPI app."""
        from app.main import app
        from fastapi.testclient import TestClient
        with TestClient(app) as c:
            yield c

    def test_system_features_returns_200(self, client):
        """GET /api/v1/system/features should return 200."""
        resp = client.get("/api/v1/system/features")
        assert resp.status_code == 200

    def test_system_features_returns_features_and_plugins(self, client):
        """Response should contain features mapping and enabled_plugins list."""
        resp = client.get("/api/v1/system/features")
        data = resp.json()
        assert "features" in data
        assert "enabled_plugins" in data

    def test_system_features_values_match_yaml(self, client):
        """Returned values should match the features.yaml content."""
        resp = client.get("/api/v1/system/features")
        data = resp.json()
        assert data["features"]["edge_client"] is False
        assert data["features"]["tools"] is True
        assert data["enabled_plugins"] == ["proxy_rewrite"]

    def test_system_features_no_auth_required(self, client):
        """Endpoint should be accessible without authentication."""
        resp = client.get("/api/v1/system/features")
        assert resp.status_code == 200
        # Verify it's the real endpoint, not a redirect to login
        assert "/api/v1/system/features" in str(resp.url)


class TestFeatureRoutersDict:
    """Unit tests for the feature_routers dict."""

    def test_ssl_cert_in_feature_routers(self):
        """feature_routers should contain ssl_cert key with a router."""
        from app.api.v1 import feature_routers
        assert "ssl_cert" in feature_routers
        assert feature_routers["ssl_cert"] is not None
        assert len(feature_routers["ssl_cert"].routes) > 0

    def test_dns_proxy_udp_in_feature_routers(self):
        """dns_proxy_udp should be in feature_routers with a router."""
        from app.api.v1 import feature_routers
        assert "dns_proxy_udp" in feature_routers
        assert feature_routers["dns_proxy_udp"] is not None
        assert len(feature_routers["dns_proxy_udp"].routes) > 0

    def test_dns_proxy_http_not_yet_in_feature_routers(self):
        """dns_proxy_http not yet added (will be added in Task 5)."""
        from app.api.v1 import feature_routers
        assert "dns_proxy_http" not in feature_routers
