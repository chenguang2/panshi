"""静态资源批量删除（全局端点 DELETE /static_resources）：逐条结果 + 越界防护 + 文件清理。

契约（r24 U2 契约统一，静态资源卡片页推广 21.9b）：
- 端点返回 ``{message, results: [...]}``，每条含 ``{static_resource_id, resource_name, status, results}``；
- **单条失败不阻塞其余条**（不存在 / 存储目录越界 / 无权限 / Edge 失败都只标记该条）；
- 越界防护在**任何删除发生之前**拒绝该条（precheck），脏 edge_uuid 资源的
  ConfigVersion / 库行 / 本地文件都不动；
- ``delete_db`` 同时清理本地 zip 文件与存储目录（与单删端点同语义）；
- Edge 侧按 query 参数 ``edge_uuid`` 定位（raw_delete），与单删端点一致。
"""

from unittest.mock import AsyncMock, patch

import pytest

pytestmark = pytest.mark.asyncio


async def _seed_resource(session_factory, *, suffix: str, cluster_id: int = 1, edge_uuid: str | None = None) -> int:
    """直接播种一条静态资源（创建端点要求已发布路由，批量删除测试不需要走该链路）。

    route_id 默认 None（FK 免造路由）；route_exists=False 语义与孤儿路由一致。
    """
    from app.models.static_resource import StaticResource

    async with session_factory() as s:
        row = StaticResource(
            cluster_id=cluster_id,
            route_id=None,
            edge_uuid=edge_uuid,
            name=f"bd-sr-{suffix}",
            url_path=f"/{suffix}/*",
        )
        s.add(row)
        await s.commit()
        return row.id


class TestBatchDeleteStaticResources:
    async def test_result_shape_and_db_only(self, async_authed_client, isolated_session):
        client = async_authed_client
        a = await _seed_resource(isolated_session, suffix="a", edge_uuid="sr-uuid-a")
        b = await _seed_resource(isolated_session, suffix="b", edge_uuid="sr-uuid-b")

        r = await client.request(
            "DELETE",
            "/api/v1/static_resources",
            json={"static_resource_ids": [a, b], "delete_db": True, "delete_edge": False},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["results"]) == 2
        for item in body["results"]:
            assert item["status"] == "success"
            assert item["results"] == [{"scope": "database", "status": "success", "message": "数据库记录已删除"}]
            assert item["resource_name"].startswith("bd-sr-")

        # 真删校验：列表里不再出现
        left = await client.get("/api/v1/static_resources", params={"page_size": 100})
        ids = {it["id"] for it in left.json()["items"]}
        assert a not in ids and b not in ids

    async def test_missing_id_reports_error_not_500(self, async_authed_client, isolated_session):
        r = await async_authed_client.request(
            "DELETE",
            "/api/v1/static_resources",
            json={"static_resource_ids": [999999], "delete_db": True},
        )
        assert r.status_code == 200
        item = r.json()["results"][0]
        assert item["status"] == "failed"
        # 全局端点（无 cluster_id 上下文）的缺失文案
        assert "不存在" in item["error"]

    async def test_empty_ids_400(self, async_authed_client, isolated_session):
        r = await async_authed_client.request(
            "DELETE",
            "/api/v1/static_resources",
            json={"static_resource_ids": [], "delete_db": True},
        )
        assert r.status_code == 400

    async def test_out_of_bounds_storage_refused_per_item(self, async_authed_client, isolated_session, tmp_path, monkeypatch):
        """脏 edge_uuid（越界）该条 failed 且不波及同批其余条目。"""
        import app.api.v1.cluster_static_resources as csr

        monkeypatch.setattr(csr, "BASE_STORAGE_DIR", str(tmp_path))
        bad = await _seed_resource(isolated_session, suffix="bad", edge_uuid="../evil")
        good = await _seed_resource(isolated_session, suffix="good", edge_uuid="sr-uuid-good")

        r = await async_authed_client.request(
            "DELETE",
            "/api/v1/static_resources",
            json={"static_resource_ids": [bad, good], "delete_db": True, "delete_edge": False},
        )
        assert r.status_code == 200, r.text
        by_id = {it["static_resource_id"]: it for it in r.json()["results"]}
        assert by_id[bad]["status"] == "failed"
        assert "越界" in by_id[bad]["error"]
        assert by_id[good]["status"] == "success"
        # 失败条目的库行仍在
        left = await async_authed_client.get("/api/v1/static_resources", params={"page_size": 100})
        ids = {it["id"] for it in left.json()["items"]}
        assert bad in ids and good not in ids

    async def test_delete_db_purges_local_files(self, async_authed_client, isolated_session, tmp_path, monkeypatch):
        """delete_db 同时清理本地 zip 文件与存储目录（与单删端点同语义）。"""
        import os

        import app.api.v1.cluster_static_resources as csr

        base = tmp_path / "static"
        res_dir = base / "sr-uuid-files"
        res_dir.mkdir(parents=True)
        zip_file = res_dir / "1.zip"
        zip_file.write_text("zip")
        storage_path = str(zip_file)
        monkeypatch.setattr(csr, "BASE_STORAGE_DIR", str(base))

        from app.models.static_resource import StaticResource

        async with isolated_session() as s:
            row = StaticResource(
                cluster_id=1,
                route_id=None,
                edge_uuid="sr-uuid-files",
                name="bd-sr-files",
                url_path="/files/*",
                storage_path=storage_path,
            )
            s.add(row)
            await s.commit()
            rid = row.id

        r = await async_authed_client.request(
            "DELETE",
            "/api/v1/static_resources",
            json={"static_resource_ids": [rid], "delete_db": True, "delete_edge": False},
        )
        assert r.status_code == 200, r.text
        assert r.json()["results"][0]["status"] == "success"
        assert not os.path.exists(storage_path)
        assert not res_dir.exists()

    async def test_edge_delete_uses_edge_uuid_query_param(self, async_authed_client, isolated_session):
        """Edge 删除标识 = edge_uuid，走 raw_delete query 参数（单删端点同款）。"""
        client = async_authed_client
        rid = await _seed_resource(isolated_session, suffix="edge", edge_uuid="sr-uuid-edge")
        captured: dict = {}

        async def fake_delete_on_nodes(cluster_id, nodes, identifier, fn):  # noqa: ANN001
            captured["identifier"] = identifier
            fake_client = type("C", (), {"raw_delete": AsyncMock(return_value={})})()
            await fn(fake_client, identifier)
            captured["url"] = fake_client.raw_delete.call_args[0][0]
            return [{"scope": "edge", "status": "success", "node": "10.0.0.1:9000"}]

        with patch("app.services.edge_sync.delete_on_nodes", fake_delete_on_nodes):
            r = await client.request(
                "DELETE",
                "/api/v1/static_resources",
                json={"static_resource_ids": [rid], "delete_db": False, "delete_edge": True},
            )
        assert r.status_code == 200, r.text
        item = r.json()["results"][0]
        assert item["status"] == "success"
        assert captured["identifier"] == "sr-uuid-edge"
        assert "edge_uuid=sr-uuid-edge" in captured["url"]

    async def test_global_endpoint_deletes_across_clusters(self, async_authed_client, isolated_session):
        client = async_authed_client
        c2 = await client.post("/api/v1/clusters", json={"name": "sr-batch-cluster"})
        assert c2.status_code in (200, 201), c2.text
        cid2 = c2.json()["id"]
        a = await _seed_resource(isolated_session, suffix="c1", edge_uuid="sr-uuid-c1", cluster_id=1)
        b = await _seed_resource(isolated_session, suffix="c2", edge_uuid="sr-uuid-c2", cluster_id=cid2)

        res = await client.request(
            "DELETE",
            "/api/v1/static_resources",
            json={"static_resource_ids": [a, b], "delete_db": True, "delete_edge": False},
        )
        assert res.status_code == 200, res.text
        assert [it["status"] for it in res.json()["results"]] == ["success", "success"]


class TestStaticResourceBatchPermission:
    """非 admin 用户：未授权集群条目逐条 failed + 「无权限操作该集群」，不整体 403。"""

    async def test_unauthorized_cluster_item_fails_without_blocking(self, async_authed_client, isolated_session):
        client = async_authed_client
        created = await client.post(
            "/api/v1/admin/users",
            json={"username": "sr-batch-user", "password": "Passw0rd!23", "role": "user"},
        )
        assert created.status_code in (200, 201), created.text
        uid = created.json()["id"]
        c2 = await client.post("/api/v1/clusters", json={"name": "sr-perm-cluster"})
        assert c2.status_code in (200, 201), c2.text
        cid2 = c2.json()["id"]

        perm = await client.put(f"/api/v1/admin/users/{uid}/permissions", json={"permissions": ["static_resources"]})
        assert perm.status_code in (200, 204), perm.text
        grant = await client.put(f"/api/v1/admin/users/{uid}/clusters", json={"cluster_ids": [1]})
        assert grant.status_code in (200, 204), grant.text

        a = await _seed_resource(isolated_session, suffix="auth", edge_uuid="sr-uuid-pa", cluster_id=1)
        b = await _seed_resource(isolated_session, suffix="unauth", edge_uuid="sr-uuid-pb", cluster_id=cid2)

        login = await client.post(
            "/api/v1/auth/login", json={"username": "sr-batch-user", "password": "Passw0rd!23"}
        )
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]

        res = await client.request(
            "DELETE",
            "/api/v1/static_resources",
            json={"static_resource_ids": [a, b], "delete_db": True, "delete_edge": False},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        by_id = {it["static_resource_id"]: it for it in res.json()["results"]}
        assert by_id[a]["status"] == "success"
        assert by_id[b]["status"] == "failed"
        assert "无权限操作该集群" in by_id[b]["error"]


class TestStaticResourceRouteInfo:
    """列表端点读回绑定路由现名（卡页「绑定 · 路由名」；路由改名后与 resource.name 可能漂移）。"""

    async def test_global_list_returns_route_name_and_uri(self, async_authed_client, isolated_session):
        from app.models.cluster import Route

        async with isolated_session() as s:
            s.add(Route(id=9400, cluster_id=1, name="sr-info-route", uri="/sr-info/*", current_version=2))
            await s.commit()

        rid = await _seed_resource(isolated_session, suffix="info", edge_uuid="sr-uuid-info")
        from app.models.static_resource import StaticResource

        async with isolated_session() as s:
            row = await s.get(StaticResource, rid)
            row.route_id = 9400
            await s.commit()

        res = await async_authed_client.get("/api/v1/static_resources", params={"page_size": 100})
        assert res.status_code == 200, res.text
        item = next(it for it in res.json()["items"] if it["id"] == rid)
        assert item["route_name"] == "sr-info-route"
        assert item["route_uri"] == "/sr-info/*"

    async def test_orphan_route_name_is_none(self, async_authed_client, isolated_session):
        """孤儿路由（route_exists=false）：route_name 为空、不报错。"""
        rid = await _seed_resource(isolated_session, suffix="orphan")  # route_id 9999x 不存在
        res = await async_authed_client.get("/api/v1/static_resources", params={"page_size": 100})
        assert res.status_code == 200, res.text
        item = next(it for it in res.json()["items"] if it["id"] == rid)
        assert item["route_exists"] is False
        assert item["route_name"] is None
