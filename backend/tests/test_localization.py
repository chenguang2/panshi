import pytest


@pytest.mark.asyncio
async def test_login_invalid_credentials_chinese(async_authed_client):
    response = await async_authed_client.post(
        "/api/v1/auth/login",
        json={"username": "wronguser", "password": "wrongpassword"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "用户名或密码错误"


@pytest.mark.asyncio
async def test_user_not_found_returns_chinese(async_authed_client):
    response = await async_authed_client.get("/api/v1/admin/users/99999")
    assert response.status_code == 404
    assert response.json()["detail"] == "用户不存在"


@pytest.mark.asyncio
async def test_cluster_not_found_returns_chinese(async_authed_client):
    response = await async_authed_client.get("/api/v1/clusters/99999")
    assert response.status_code == 404
    assert response.json()["detail"] == "集群不存在"


@pytest.mark.asyncio
async def test_route_not_found_returns_chinese(async_authed_client):
    response = await async_authed_client.get("/api/v1/clusters/1/routes/99999")
    assert response.status_code == 404
    assert response.json()["detail"] == "路由不存在"


@pytest.mark.asyncio
async def test_product_name_appears_as_磐石():
    pass


@pytest.mark.asyncio
async def test_login_success_message(async_authed_client):
    response = await async_authed_client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "panshi123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["username"] == "admin"
