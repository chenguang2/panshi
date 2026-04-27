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

    async def test_list_routes_pagination(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get(
                "/api/v1/clusters/1/routes",
                headers=headers,
                params={"page": 1, "page_size": 5}
            )
            assert response.status_code == 200
            data = response.json()
            assert "total" in data
            assert "page" in data
            assert "page_size" in data
            assert data["page"] == 1
            assert data["page_size"] == 5
            assert len(data["items"]) <= 5

    async def test_list_routes_sorting_asc(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get(
                "/api/v1/clusters/1/routes",
                headers=headers,
                params={"page": 1, "page_size": 10, "sort_by": "priority", "sort_order": "asc"}
            )
            assert response.status_code == 200
            data = response.json()
            items = data["items"]
            priorities = [item["priority"] for item in items if item.get("priority") is not None]
            assert priorities == sorted(priorities)

    async def test_list_routes_sorting_desc(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get(
                "/api/v1/clusters/1/routes",
                headers=headers,
                params={"page": 1, "page_size": 10, "sort_by": "priority", "sort_order": "desc"}
            )
            assert response.status_code == 200
            data = response.json()
            items = data["items"]
            priorities = [item["priority"] for item in items if item.get("priority") is not None]
            assert priorities == sorted(priorities, reverse=True)

    async def test_list_routes_search_global(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get(
                "/api/v1/clusters/1/routes",
                headers=headers,
                params={"page": 1, "page_size": 50, "search": "test"}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["total"] <= 300
            for item in data["items"]:
                name_match = "test" in (item.get("name") or "").lower()
                uri_match = "test" in (item.get("uri") or "").lower()
                desc_match = "test" in (item.get("description") or "").lower()
                hosts_match = "test" in (item.get("hosts") or "").lower()
                assert name_match or uri_match or desc_match or hosts_match

    async def test_list_routes_search_by_field(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get(
                "/api/v1/clusters/1/routes",
                headers=headers,
                params={"page": 1, "page_size": 50, "search": "test", "search_field": "name"}
            )
            assert response.status_code == 200
            data = response.json()
            for item in data["items"]:
                assert "test" in (item.get("name") or "").lower()