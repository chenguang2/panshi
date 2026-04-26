import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


class TestAdvancedMatchEnabled:

    async def test_create_route_with_advanced_match_enabled_false(self):
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
                    "name": "test-ame-false-create",
                    "uri": "/test-ame-false/*",
                    "advanced_match_enabled": False,
                    "vars": []
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["advanced_match_enabled"] == False
            assert data["vars"] == []

    async def test_create_route_with_advanced_match_enabled_true(self):
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
                    "name": "test-ame-true-create",
                    "uri": "/test-ame-true/*",
                    "advanced_match_enabled": True,
                    "vars": [["http_host", "==", "test.com"]]
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["advanced_match_enabled"] == True
            assert data["vars"] == [["http_host", "==", "test.com"]]

    async def test_update_advanced_match_enabled_false_to_true(self):
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
                    "name": "test-ame-toggle",
                    "uri": "/test-ame-toggle/*",
                    "advanced_match_enabled": False,
                    "vars": []
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["advanced_match_enabled"] == False
            route_id = data["id"]

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={
                    "advanced_match_enabled": True,
                    "vars": [["http_host", "==", "enabled.com"]]
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["advanced_match_enabled"] == True
            assert data["vars"] == [["http_host", "==", "enabled.com"]]

    async def test_update_advanced_match_enabled_true_to_false(self):
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
                    "name": "test-ame-toggle-off",
                    "uri": "/test-ame-toggle-off/*",
                    "advanced_match_enabled": True,
                    "vars": [["http_host", "==", "on.com"]]
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["advanced_match_enabled"] == True
            route_id = data["id"]

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={
                    "advanced_match_enabled": False,
                    "vars": []
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["advanced_match_enabled"] == False
            assert data["vars"] == []

    async def test_get_route_returns_advanced_match_enabled(self):
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
                    "name": "test-ame-get",
                    "uri": "/test-ame-get/*",
                    "advanced_match_enabled": True,
                    "vars": [["arg_version", "==", "v2"]]
                }
            )
            assert response.status_code == 201
            route_id = response.json()["id"]

            response = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers
            )
            assert response.status_code == 200
            data = response.json()
            assert "advanced_match_enabled" in data
            assert data["advanced_match_enabled"] == True
            assert data["vars"] == [["arg_version", "==", "v2"]]

    async def test_toggle_workflow_complete(self):
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
                    "name": "test-ame-full-toggle",
                    "uri": "/test-ame-full/*",
                    "advanced_match_enabled": False,
                    "vars": []
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["advanced_match_enabled"] == False
            route_id = data["id"]

            response = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers
            )
            assert response.status_code == 200
            data = response.json()
            assert data["advanced_match_enabled"] == False
            assert data["vars"] == []

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={
                    "advanced_match_enabled": True,
                    "vars": [["http_host", "==", "example.com"]]
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["advanced_match_enabled"] == True

            response = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers
            )
            assert response.status_code == 200
            data = response.json()
            assert data["advanced_match_enabled"] == True
            assert data["vars"] == [["http_host", "==", "example.com"]]

            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={
                    "advanced_match_enabled": False,
                    "vars": []
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["advanced_match_enabled"] == False
            assert data["vars"] == []

            response = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers
            )
            assert response.status_code == 200
            data = response.json()
            assert data["advanced_match_enabled"] == False
            assert data["vars"] == []
