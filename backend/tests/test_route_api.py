import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


class TestRouteAPI:

    async def test_create_route_with_priority(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            assert response.status_code == 200
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "test-priority-api",
                    "uri": "/api/priority/*",
                    "priority": 50,
                    "status": 1
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["priority"] == 50

    async def test_update_route_priority(self):
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
                    "name": "update-priority-test",
                    "uri": "/api/update-priority/*",
                    "priority": 10,
                    "status": 1
                }
            )
            route_id = response.json()["id"]

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"priority": 99}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["priority"] == 99

    async def test_update_route_vars_empty_array(self):
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
                    "name": "test-empty-vars-api",
                    "uri": "/api/empty/*",
                    "vars": []
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["vars"] == []

            route_id = data["id"]
            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"priority": 100}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["priority"] == 100
            assert data["vars"] == []

    async def test_update_route_vars_from_null_to_empty(self):
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
                    "name": "test-null-vars-api",
                    "uri": "/api/null/*"
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["vars"] is None

            route_id = data["id"]
            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"vars": []}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["vars"] == []

    async def test_update_route_priority_and_vars_together(self):
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
                    "name": "test-both-fields",
                    "uri": "/api/both/*",
                    "priority": 5,
                    "vars": [["http_host", "==", "example.com"]]
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["priority"] == 5
            assert data["vars"] == [["http_host", "==", "example.com"]]

            route_id = data["id"]
            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={
                    "priority": 888,
                    "vars": [["http_host", "==", "new.com"]]
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["priority"] == 888
            assert data["vars"] == [["http_host", "==", "new.com"]]