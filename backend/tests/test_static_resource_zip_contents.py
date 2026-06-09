import pytest
import os
import io
import zipfile
import json
import tempfile
import shutil
from httpx import AsyncClient, ASGITransport
from app.main import app

SAMPLE_ZIP_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "static")
SAMPLE_RESOURCE_CLUSTER_ID = 2
SAMPLE_RESOURCE_ID = 3


class TestStaticResourceZipContents:

    async def _login(self, client):
        resp = await client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        return resp.json()["access_token"]

    # ============ RED: Failing tests first ============

    async def test_zip_contents_resource_not_found(self):
        """Non-existent resource_id returns 404"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get(
                "/api/v1/clusters/99999/static-resources/99999/zip-contents",
                headers=headers
            )
            assert response.status_code == 404
            data = response.json()
            assert "detail" in data

    async def test_zip_contents_no_zip_uploaded(self):
        """Resource exists but no ZIP uploaded returns 200 with empty items and message"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}

            # List all static resources to find one without file_size
            resp = await client.get("/api/v1/static_resources", headers=headers, params={"page_size": 100})
            resources = resp.json().get("items", [])
            no_zip_resource = None
            for r in resources:
                if not r.get("file_size"):
                    no_zip_resource = r
                    break

            if not no_zip_resource:
                pytest.skip("No static resource without ZIP found in sample data")

            response = await client.get(
                f"/api/v1/clusters/{no_zip_resource['cluster_id']}/static-resources/{no_zip_resource['id']}/zip-contents",
                headers=headers
            )
            assert response.status_code == 200
            data = response.json()
            assert data["items"] == []
            assert data["total_count"] == 0
            assert "message" in data

    async def test_zip_contents_success_with_sample_zip(self):
        """Resource with valid real ZIP file returns file listing"""
        zip_path = os.path.join(SAMPLE_ZIP_DIR, "fe8eacc0-8d32-4ceb-95d6-02b357424d26", "3.zip")
        if not os.path.exists(zip_path):
            pytest.skip(f"Sample ZIP not found at {zip_path}")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get(
                f"/api/v1/clusters/{SAMPLE_RESOURCE_CLUSTER_ID}/static-resources/{SAMPLE_RESOURCE_ID}/zip-contents",
                headers=headers
            )
            assert response.status_code == 200
            data = response.json()
            assert "items" in data
            assert "total_count" in data
            assert isinstance(data["items"], list)
            assert len(data["items"]) > 0
            for item in data["items"]:
                assert "name" in item
                assert "file_size" in item
                assert "compressed_size" in item
                assert "modified" in item
                assert isinstance(item["file_size"], int)
                assert isinstance(item["compressed_size"], int)
            assert data["total_count"] >= len(data["items"])

    async def test_zip_contents_uses_items_key(self):
        """Response uses 'items' key (project convention), not 'files'"""
        zip_path = os.path.join(SAMPLE_ZIP_DIR, "fe8eacc0-8d32-4ceb-95d6-02b357424d26", "3.zip")
        if not os.path.exists(zip_path):
            pytest.skip("Sample ZIP not found")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get(
                f"/api/v1/clusters/{SAMPLE_RESOURCE_CLUSTER_ID}/static-resources/{SAMPLE_RESOURCE_ID}/zip-contents",
                headers=headers
            )
            data = response.json()
            assert "items" in data
            assert "files" not in data
            assert "total_count" in data
