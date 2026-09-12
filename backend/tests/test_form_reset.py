import pytest


@pytest.mark.asyncio
async def test_create_user_with_empty_password_rejected(async_authed_client):
    response = await async_authed_client.post(
        "/api/v1/admin/users",
        json={"username": "testuser", "password": "", "role": "user", "status": 1},
    )
    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_create_cluster_with_empty_fields(async_authed_client):
    response = await async_authed_client.post(
        "/api/v1/clusters",
        json={"name": "", "admin_url": "", "admin_key": "", "status": 1},
    )
    assert response.status_code in [400, 422]
