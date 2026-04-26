import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
import json


class TestRouteAdvancedMatchSwitch:

    async def test_create_route_with_empty_vars_array(self):
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
                    "name": "empty-vars-route",
                    "uri": "/empty/*",
                    "vars": []
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["vars"] == []

    async def test_update_route_set_vars_to_empty_array(self):
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
                    "name": "vars-empty-update-test",
                    "uri": "/update-empty/*"
                }
            )
            route_id = response.json()["id"]

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"vars": []}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["vars"] == []

    async def test_update_route_set_vars_to_null(self):
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
                    "name": "vars-null-update-test",
                    "uri": "/update-null/*",
                    "vars": []
                }
            )
            route_id = response.json()["id"]
            assert response.json()["vars"] == []

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"vars": None}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["vars"] is None

    async def test_toggle_vars_from_empty_to_null_and_back(self):
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
                    "name": "toggle-vars-test",
                    "uri": "/toggle/*",
                    "vars": []
                }
            )
            route_id = response.json()["id"]
            assert response.json()["vars"] == []

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"vars": [["http_host", "==", "test.com"]]}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["vars"] == [["http_host", "==", "test.com"]]

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"vars": []}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["vars"] == []

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"vars": None}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["vars"] is None

    async def test_priority_preserved_when_updating_vars_only(self):
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
                    "name": "priority-preserve-test",
                    "uri": "/preserve/*",
                    "priority": 777
                }
            )
            route_id = response.json()["id"]
            assert response.json()["priority"] == 777

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"vars": [["arg_page", "==", "1"]]}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["priority"] == 777
            assert data["vars"] == [["arg_page", "==", "1"]]

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"vars": []}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["priority"] == 777
            assert data["vars"] == []

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"vars": None}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["priority"] == 777
            assert data["vars"] is None