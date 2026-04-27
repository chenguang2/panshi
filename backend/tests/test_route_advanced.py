import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


class TestRouteAdvancedMatchAPI:
    """测试路由高级匹配（vars）和插件管理 API"""

    async def _login(self, client: AsyncClient) -> dict:
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"}
        )
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    # ─── vars 字段测试 ───────────────────────────────────────────────

    async def test_create_route_with_vars(self):
        """创建路由时携带 vars 字段，应正确存储并返回"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)

            response = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "route-with-vars",
                    "uri": "/api/vars-test/*",
                    "vars": [["http_host", "==", "example.com"], ["arg_version", "==", "v2"]],
                    "status": 1
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["vars"] == [["http_host", "==", "example.com"], ["arg_version", "==", "v2"]]
            assert data["name"] == "route-with-vars"

    async def test_create_route_with_advanced_match_enabled(self):
        """创建路由时 advanced_match_enabled=true，vars 不为空"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)

            response = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "route-with-advanced-enabled",
                    "uri": "/api/adv-test/*",
                    "advanced_match_enabled": True,
                    "vars": [["remote_addr", "IN", "192.168.1.0/24"]],
                    "status": 1
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["advanced_match_enabled"] is True
            assert data["vars"] == [["remote_addr", "IN", "192.168.1.0/24"]]

    async def test_update_route_vars_and_advanced_match_enabled(self):
        """更新路由的 vars 和 advanced_match_enabled 字段"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)

            # 先创建
            create_resp = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "route-update-vars",
                    "uri": "/api/update-vars/*",
                    "status": 1
                }
            )
            route_id = create_resp.json()["id"]

            # 更新 vars 和 advanced_match_enabled
            update_resp = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={
                    "vars": [["arg_api_key", "==", "secret123"]],
                    "advanced_match_enabled": True
                }
            )
            assert update_resp.status_code == 200
            data = update_resp.json()
            assert data["vars"] == [["arg_api_key", "==", "secret123"]]
            assert data["advanced_match_enabled"] is True

    async def test_update_route_disable_advanced_match(self):
        """关闭高级匹配后 vars 置为空"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)

            # 先创建带 vars 的路由
            create_resp = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "route-disable-adv",
                    "uri": "/api/disable-adv/*",
                    "vars": [["http_host", "==", "test.com"]],
                    "advanced_match_enabled": True,
                    "status": 1
                }
            )
            route_id = create_resp.json()["id"]

            # 关闭高级匹配
            update_resp = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={
                    "advanced_match_enabled": False,
                    "vars": []
                }
            )
            assert update_resp.status_code == 200
            data = update_resp.json()
            assert data["advanced_match_enabled"] is False
            assert data["vars"] == []

    async def test_get_route_returns_deserialized_vars(self):
        """GET /routes/:id 返回的 vars 应为正确 JSON 结构（反序列化）"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)

            # 创建带 vars 的路由
            create_resp = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "route-get-vars",
                    "uri": "/api/get-vars/*",
                    "vars": [["arg_token", "==", "abc"]],
                    "status": 1
                }
            )
            route_id = create_resp.json()["id"]

            # GET 应返回列表而非 JSON 字符串
            get_resp = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers
            )
            assert get_resp.status_code == 200
            data = get_resp.json()
            assert isinstance(data["vars"], list)
            assert data["vars"] == [["arg_token", "==", "abc"]]

    # ─── 插件管理 API 测试 ────────────────────────────────────────────

    async def test_get_route_plugins_empty(self):
        """新建路由无插件时返回空列表"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)

            create_resp = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "route-no-plugins",
                    "uri": "/api/no-plugins/*",
                    "status": 1
                }
            )
            route_id = create_resp.json()["id"]

            get_resp = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}/plugins",
                headers=headers
            )
            assert get_resp.status_code == 200
            assert get_resp.json()["plugins"] == []

    async def test_update_and_get_route_plugins(self):
        """PUT 更新路由插件后，GET 应返回正确的插件列表"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)

            # 创建路由
            create_resp = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "route-with-plugins",
                    "uri": "/api/with-plugins/*",
                    "status": 1
                }
            )
            route_id = create_resp.json()["id"]

            # 添加插件
            update_resp = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}/plugins",
                headers=headers,
                json={
                    "plugins": [
                        {"plugin_name": "ip-restriction", "config": '{"whitelist": "10.0.0.0/8"}'},
                        {"plugin_name": "cors", "config": '{"allow_origins": "*"}'}
                    ]
                }
            )
            assert update_resp.status_code == 200
            assert "插件配置已更新" in update_resp.json()["message"]

            # 获取插件
            get_resp = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}/plugins",
                headers=headers
            )
            assert get_resp.status_code == 200
            plugins = get_resp.json()["plugins"]
            assert len(plugins) == 2
            assert plugins[0]["plugin_name"] == "ip-restriction"
            assert plugins[1]["plugin_name"] == "cors"

    async def test_update_plugins_replace_existing(self):
        """PUT 插件应全量替换已有插件"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)

            # 创建并添加初始插件
            create_resp = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "route-replace-plugins",
                    "uri": "/api/replace-plugins/*",
                    "status": 1
                }
            )
            route_id = create_resp.json()["id"]

            await client.put(
                f"/api/v1/clusters/1/routes/{route_id}/plugins",
                headers=headers,
                json={
                    "plugins": [
                        {"plugin_name": "limit-req", "config": '{"rate": 100}'}
                    ]
                }
            )

            # 全量替换为新插件
            await client.put(
                f"/api/v1/clusters/1/routes/{route_id}/plugins",
                headers=headers,
                json={
                    "plugins": [
                        {"plugin_name": "key-auth", "config": '{"key": "query"}'}
                    ]
                }
            )

            get_resp = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}/plugins",
                headers=headers
            )
            plugins = get_resp.json()["plugins"]
            assert len(plugins) == 1
            assert plugins[0]["plugin_name"] == "key-auth"

    async def test_update_plugins_clear_all(self):
        """PUT 空 plugins 列表应清除所有插件"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)

            create_resp = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "route-clear-plugins",
                    "uri": "/api/clear-plugins/*",
                    "status": 1
                }
            )
            route_id = create_resp.json()["id"]

            # 先添加插件
            await client.put(
                f"/api/v1/clusters/1/routes/{route_id}/plugins",
                headers=headers,
                json={
                    "plugins": [{"plugin_name": "jwt-auth", "config": '{"secret": "xxx"}'}]
                }
            )

            # 清空
            clear_resp = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}/plugins",
                headers=headers,
                json={"plugins": []}
            )
            assert clear_resp.status_code == 200

            get_resp = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}/plugins",
                headers=headers
            )
            assert get_resp.json()["plugins"] == []
