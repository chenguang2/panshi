import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_create_user_with_empty_password_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_response = await ac.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"}
        )
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = await ac.post(
            "/api/v1/admin/users",
            json={"username": "testuser", "password": "", "role": "user", "status": 1},
            headers=headers
        )
        assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_create_cluster_with_empty_fields():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_response = await ac.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"}
        )
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = await ac.post(
            "/api/v1/clusters",
            json={"name": "", "admin_url": "", "admin_key": "", "status": 1},
            headers=headers
        )
        assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_create_dict_type_with_empty_fields():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_response = await ac.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"}
        )
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = await ac.post(
            "/api/v1/dict/types",
            json={"code": "", "name": "", "status": 1},
            headers=headers
        )
        assert response.status_code in [400, 422]