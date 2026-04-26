import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


class TestRoutePriority:

    async def test_create_route_with_priority_zero(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "test-priority-zero",
                    "uri": "/test-priority-zero/*",
                    "priority": 0,
                    "status": 1
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["priority"] == 0

    async def test_create_route_without_priority(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "test-no-priority",
                    "uri": "/test-no-priority/*",
                    "status": 1
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["priority"] == 0

    async def test_update_priority_to_zero(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "test-update-priority-zero",
                    "uri": "/test-update-priority-zero/*",
                    "priority": 100,
                    "status": 1
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["priority"] == 100
            route_id = data["id"]

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"priority": 0}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["priority"] == 0

    async def test_update_priority_preserves_other_fields(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "test-preserve-fields",
                    "uri": "/test-preserve/*",
                    "priority": 50,
                    "status": 1
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["priority"] == 50
            route_id = data["id"]

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"priority": 0}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["priority"] == 0
            assert data["name"] == "test-preserve-fields"
            assert data["uri"] == "/test-preserve/*"
