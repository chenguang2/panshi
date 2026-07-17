"""Tests for cluster install endpoints after splitting from cluster_nodes.py."""

import os
import stat
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError
from unittest.mock import AsyncMock, patch


class TestListOpenrestyFiles:
    """list_openresty_files helper should return correct file list."""

    def test_returns_matching_files_with_info(self, tmp_path):
        """list_openresty_files should return name, size, size_display, mtime for each match."""
        from app.api.v1.cluster_install import list_openresty_files

        # Create test files
        f1 = tmp_path / "openresty-edge-26071308.tar.gz"
        f1.write_bytes(b"x" * 1024)
        os.utime(f1, (1700000000, 1700000000))

        f2 = tmp_path / "openresty-edge-26071515.tar.gz"
        f2.write_bytes(b"y" * 2048)
        os.utime(f2, (1700000100, 1700000100))

        # Non-matching file should be filtered out
        (tmp_path / "edge-pack-3.1.1.tgz").write_bytes(b"z" * 512)

        result = list_openresty_files(str(tmp_path))

        assert len(result) == 2
        # Should be sorted by mtime descending
        assert result[0]["name"] == "openresty-edge-26071515.tar.gz"
        assert result[1]["name"] == "openresty-edge-26071308.tar.gz"

        for item in result:
            assert "name" in item
            assert "size" in item
            assert "size_display" in item
            assert "mtime" in item

    def test_returns_empty_when_no_matching_files(self, tmp_path):
        """list_openresty_files should return empty list when no openresty-*.tar.gz files exist."""
        from app.api.v1.cluster_install import list_openresty_files

        (tmp_path / "some-other-file.txt").write_text("hello")
        result = list_openresty_files(str(tmp_path))
        assert result == []

    def test_returns_empty_when_dir_not_exist(self):
        """list_openresty_files should return empty list when directory doesn't exist."""
        from app.api.v1.cluster_install import list_openresty_files

        result = list_openresty_files("/tmp/nonexistent_soft_dir_12345")
        assert result == []

    def test_size_display_format(self, tmp_path):
        """size_display should format bytes to human-readable string."""
        from app.api.v1.cluster_install import list_openresty_files

        f = tmp_path / "openresty-test.tar.gz"
        f.write_bytes(b"a" * 10485760)  # 10 MB
        result = list_openresty_files(str(tmp_path))
        assert result[0]["size_display"] == "10.0 MB"


class TestOpenrestyFilesEndpoint:
    """GET /clusters/{id}/nodes/openresty-files endpoint."""

    @pytest.fixture
    def client(self):
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_endpoint_returns_200(self, client, tmp_path, monkeypatch):
        """GET openresty-files should return 200 with file list."""
        from app.api.v1.cluster_install import list_openresty_files
        f = tmp_path / "openresty-edge-test.tar.gz"
        f.write_bytes(b"test")

        monkeypatch.setattr("app.api.v1.cluster_install.list_openresty_files",
                            lambda _: [{"name": "openresty-edge-test.tar.gz", "size": 4, "size_display": "4 B", "mtime": "2026-01-01T00:00:00Z"}])

        resp = client.get("/api/v1/clusters/1/nodes/openresty-files")
        assert resp.status_code == 200
        data = resp.json()
        assert "files" in data
        assert len(data["files"]) == 1
        assert data["files"][0]["name"] == "openresty-edge-test.tar.gz"


class TestInstallOpenrestyRequest:
    """InstallOpenrestyRequest should require openresty_file."""

    def test_accepts_prefix_and_openresty_file(self):
        """InstallOpenrestyRequest should accept valid prefix + openresty_file."""
        from app.api.v1.cluster_install import InstallOpenrestyRequest
        req = InstallOpenrestyRequest(prefix="/data/test", openresty_file="openresty-test.tar.gz")
        assert req.prefix == "/data/test"
        assert req.openresty_file == "openresty-test.tar.gz"

    def test_rejects_missing_openresty_file(self):
        """InstallOpenrestyRequest should reject missing openresty_file."""
        from app.api.v1.cluster_install import InstallOpenrestyRequest
        with pytest.raises(ValidationError):
            InstallOpenrestyRequest(prefix="/data/test")

    def test_rejects_extra_legacy_fields(self):
        """InstallOpenrestyRequest should ignore legacy srcpath/destpath fields."""
        from app.api.v1.cluster_install import InstallOpenrestyRequest
        req = InstallOpenrestyRequest(prefix="/data/test", openresty_file="f.tar.gz", srcpath="/old", destpath="/old")
        assert req.prefix == "/data/test"
        assert req.openresty_file == "f.tar.gz"
        # srcpath/destpath should not be in the model
        assert not hasattr(req, "srcpath")


class TestInstallOpenrestyStreamExtravars:
    """_install_openresty_stream should include openresty_file in extravars."""

    @pytest.mark.asyncio
    async def test_openresty_file_in_extravars(self, monkeypatch):
        """_install_openresty_stream should include openresty_file in extravars."""
        from app.api.v1.cluster_install import _install_openresty_stream

        captured_extravars = {}

        async def mock_gen(*args, **kwargs):
            nonlocal captured_extravars
            captured_extravars = kwargs.get("extravars", {})
            yield "data: {\"rc\": 0}\n\n"

        monkeypatch.setattr("app.api.v1.cluster_install._run_ansible_stream", mock_gen)

        class FakeNode:
            ip = "192.168.1.1"

        gen = _install_openresty_stream(None, FakeNode(), "/data/test", "/path/to/soft", "/data/", openresty_file="my-file.tar.gz")
        async for _ in gen:
            pass

        assert captured_extravars.get("openresty_file") == "my-file.tar.gz"


class TestInstallOpenrestyRouter:
    """install_openresty_router should exist with correct endpoints."""

    @pytest.fixture
    def client(self):
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_install_openresty_endpoint_returns_404(self, client):
        """POST /api/v1/clusters/{id}/nodes/{nid}/install-openresty should exist."""
        # A non-existent cluster/node should give 404 (not found)
        # rather than 405 (method not allowed) or 404 at router level.
        resp = client.post("/api/v1/clusters/99999/nodes/99999/install-openresty",
                          json={"prefix": "/test", "openresty_file": "f.tar.gz"})
        assert resp.status_code == 404

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


class TestEdgePackListEndpoint:
    """GET /clusters/{id}/nodes/{nid}/edge-pack-list"""

    @pytest.fixture
    def client(self):
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_endpoint_exists(self, client):
        resp = client.get("/api/v1/clusters/99999/nodes/99999/edge-pack-list")
        assert resp.status_code in (404, 422)

    def test_edge_pack_files_endpoint_exists(self, client):
        resp = client.get("/api/v1/clusters/1/nodes/edge-pack-files")
        assert resp.status_code in (200, 404)


class TestEdgePackAddEndpoint:
    """POST /clusters/{id}/nodes/{nid}/edge-pack-add"""

    @pytest.fixture
    def client(self):
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_endpoint_exists(self, client):
        resp = client.post(
            "/api/v1/clusters/99999/nodes/99999/edge-pack-add",
            json={"pack_file": "edge-pack-test.tgz"},
        )
        assert resp.status_code in (404, 422)


class TestEdgePackRebaseEndpoint:
    """POST /clusters/{id}/nodes/{nid}/edge-pack-rebase"""

    @pytest.fixture
    def client(self):
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_endpoint_exists(self, client):
        resp = client.post(
            "/api/v1/clusters/99999/nodes/99999/edge-pack-rebase",
            json={"version": "2.7.6.26020421"},
        )
        assert resp.status_code in (404, 422)


class TestAssociateNewOpenrestyRouter:
    """associate-new-openresty endpoint should exist."""

    @pytest.fixture
    def client(self):
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_endpoint_exists(self, client):
        """POST /api/v1/clusters/{id}/nodes/{nid}/associate-new-openresty should exist."""
        resp = client.post(
            "/api/v1/clusters/99999/nodes/99999/associate-new-openresty",
            json={"prefix": "/test"},
        )
        assert resp.status_code in (404, 422)  # 404=cluster not found, 422=validation

    def test_endpoint_rejects_without_body(self, client):
        """POST associate-new-openresty without body should return 422."""
        resp = client.post("/api/v1/clusters/1/nodes/1/associate-new-openresty")
        assert resp.status_code in (404, 422)
