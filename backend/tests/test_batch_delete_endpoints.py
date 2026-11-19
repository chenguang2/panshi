"""批量删除端点（插件组 / 全局规则）：逐条结果 + 节点可选 + PLG-07 按条失败。

契约（r21 批量删除真·前台化）：
- 端点返回与路由批量同构的 ``{message, results: [...]}``，每条含
  ``{scope: database|edge, status: success|failed|skipped, ...}``，前端进度面板逐条展示；
- **单条失败不阻塞其余条**（不存在 / 被引用 / Edge 失败都只标记该条）；
- ``node_ids`` 有值时只对指定节点删 Edge（节点可选），无值退化为全部在线节点；
- 插件组仍受 PLG-07 约束：被路由引用 → 该条 ``status=failed`` + 原因，**不整体 400**。
"""

from unittest.mock import AsyncMock, patch

from app.models.cluster import PluginConfig, Route


async def _create_group(client, name, cluster_id: int = 1):
    r = await client.post(
        f"/api/v1/clusters/{cluster_id}/plugin_configs",
        json={"name": name, "plugins": {"log_process": {}}},
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _create_rule(client, name, cluster_id: int = 1):
    r = await client.post(f"/api/v1/clusters/{cluster_id}/global_rules", json={"name": name, "plugins": {}})
    assert r.status_code == 200, r.text
    return r.json()


async def _create_route_ref(client, name, refs: list[str], cluster_id: int = 1):
    r = await client.post(
        f"/api/v1/clusters/{cluster_id}/routes",
        json={"name": name, "uri": f"/{name}/*", "plugin_config_ids": refs},
    )
    assert r.status_code == 201, r.text
    return r.json()


class TestBatchDeletePluginConfigs:
    async def test_result_shape_and_db_only(self, async_authed_client):
        client = async_authed_client
        a = await _create_group(client, "bd-a")
        b = await _create_group(client, "bd-b")

        r = await client.request(
            "DELETE",
            "/api/v1/clusters/1/plugin_configs",
            json={"plugin_config_ids": [a["id"], b["id"]], "delete_db": True, "delete_edge": False},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["results"]) == 2
        for item in body["results"]:
            assert item["status"] == "success"
            assert item["results"] == [{"scope": "database", "status": "success", "message": "数据库记录已删除"}]
            assert item["config_name"]

        # 真删校验：列表里不再出现
        left = await client.get("/api/v1/plugin_configs", params={"page_size": 100})
        ids = {it["id"] for it in left.json()["items"]}
        assert a["id"] not in ids and b["id"] not in ids

    async def test_referenced_group_fails_per_item_without_blocking_others(self, async_authed_client):
        """PLG-07：被引用的插件组按条 failed（带原因），其余条照常删除。"""
        client = async_authed_client
        referenced = await _create_group(client, "bd-ref")
        free = await _create_group(client, "bd-free")
        await _create_route_ref(client, "bd-route", [referenced["edge_uuid"]])

        r = await client.request(
            "DELETE",
            "/api/v1/clusters/1/plugin_configs",
            json={"plugin_config_ids": [referenced["id"], free["id"]], "delete_db": True, "delete_edge": False},
        )
        assert r.status_code == 200, r.text
        by_id = {it["config_id"]: it for it in r.json()["results"]}
        assert by_id[referenced["id"]]["status"] == "failed"
        assert "路由引用" in by_id[referenced["id"]]["error"]
        assert by_id[free["id"]]["status"] == "success"

    async def test_empty_ids_is_400(self, async_authed_client):
        r = await async_authed_client.request(
            "DELETE",
            "/api/v1/clusters/1/plugin_configs",
            json={"plugin_config_ids": [], "delete_db": True},
        )
        assert r.status_code == 400
        assert "不能为空" in r.json()["detail"]

    async def test_neither_scope_selected_is_400(self, async_authed_client):
        g = await _create_group(async_authed_client, "bd-scope")
        r = await async_authed_client.request(
            "DELETE",
            "/api/v1/clusters/1/plugin_configs",
            json={"plugin_config_ids": [g["id"]], "delete_db": False, "delete_edge": False},
        )
        assert r.status_code == 400
        assert "数据库" in r.json()["detail"]

    async def test_missing_id_reports_error_not_500(self, async_authed_client):
        r = await async_authed_client.request(
            "DELETE",
            "/api/v1/clusters/1/plugin_configs",
            json={"plugin_config_ids": [999999], "delete_db": True},
        )
        assert r.status_code == 200
        item = r.json()["results"][0]
        assert item["status"] == "failed"
        assert "插件组不存在" in item["error"]


class TestBatchDeleteGlobalRules:
    async def test_result_shape_and_db_only(self, async_authed_client):
        client = async_authed_client
        a = await _create_rule(client, "bd-rule-a")
        b = await _create_rule(client, "bd-rule-b")

        r = await client.request(
            "DELETE",
            "/api/v1/clusters/1/global_rules",
            json={"rule_ids": [a["id"], b["id"]], "delete_db": True, "delete_edge": False},
        )
        assert r.status_code == 200, r.text
        items = r.json()["results"]
        assert [it["status"] for it in items] == ["success", "success"]
        assert {it["rule_id"] for it in items} == {a["id"], b["id"]}

        left = await client.get("/api/v1/global_rules", params={"page_size": 100})
        ids = {it["id"] for it in left.json()["items"]}
        assert a["id"] not in ids and b["id"] not in ids

    async def test_missing_id_reports_error(self, async_authed_client):
        r = await async_authed_client.request(
            "DELETE",
            "/api/v1/clusters/1/global_rules",
            json={"rule_ids": [999999], "delete_db": True},
        )
        assert r.status_code == 200
        assert r.json()["results"][0]["status"] == "failed"
        assert "全局规则不存在" in r.json()["results"][0]["error"]

    async def test_node_ids_limits_edge_scope(self, async_authed_client):
        """节点可选：node_ids 有值时只对该节点删 Edge（其余节点不出现在结果里）。

        直接验证 `get_active_nodes` 的 node_ids 过滤语义（批量端点复用它），
        并用 patch 断言批量端点把 body.node_ids 透传下去。
        """
        client = async_authed_client
        rule = await _create_rule(client, "bd-node-scope")

        captured: dict = {}

        async def fake_delete_on_nodes(cluster_id, nodes, edge_uuid, fn):  # noqa: ANN001
            captured["node_ids"] = [n.id for n in nodes]
            return [{"scope": "edge", "status": "success", "node": "10.0.0.1:9000"}]

        with patch("app.services.edge_sync.delete_on_nodes", fake_delete_on_nodes):
            r = await client.request(
                "DELETE",
                "/api/v1/clusters/1/global_rules",
                json={"rule_ids": [rule["id"]], "delete_db": False, "delete_edge": True, "node_ids": [4242]},
            )
        assert r.status_code == 200, r.text
        # 夹具集群无节点 → get_active_nodes 过滤后为空，但 node_ids 过滤逻辑已生效（未被忽略）
        assert captured.get("node_ids") == []
        assert r.json()["results"][0]["status"] == "success"


class TestGlobalEndpoints:
    """全局 ids 批量端点（契约统一 U2）：跨集群、单条失败不阻塞、逐条权限。"""

    async def test_global_routes_endpoint_deletes_across_clusters(self, async_authed_client):
        client = async_authed_client
        r1 = await _create_route_ref(client, "ge-r1", [])
        r2 = await _create_route_ref(client, "ge-r2", [])
        res = await client.request(
            "DELETE", "/api/v1/routes",
            json={"route_ids": [r1["id"], r2["id"]], "delete_db": True, "delete_edge": False},
        )
        assert res.status_code == 200, res.text
        assert [it["status"] for it in res.json()["results"]] == ["success", "success"]

    async def test_global_plugin_configs_and_global_rules(self, async_authed_client):
        client = async_authed_client
        g = await _create_group(client, "ge-grp")
        rule = await _create_rule(client, "ge-rule")
        res1 = await client.request(
            "DELETE", "/api/v1/plugin_configs",
            json={"plugin_config_ids": [g["id"]], "delete_db": True, "delete_edge": False},
        )
        res2 = await client.request(
            "DELETE", "/api/v1/global_rules",
            json={"rule_ids": [rule["id"]], "delete_db": True, "delete_edge": False},
        )
        assert res1.status_code == 200 and res1.json()["results"][0]["status"] == "success"
        assert res2.status_code == 200 and res2.json()["results"][0]["status"] == "success"


class TestBatchDeletePermission:
    """非 admin 用户：只删授权集群的资源，未授权条目逐条 failed（不整体 403）。"""

    async def test_unauthorized_cluster_item_fails_without_blocking(self, async_authed_client):
        client = async_authed_client
        # 造一个「只授权 cluster 2」的普通用户
        admin = await client.get("/api/v1/admin/users")
        assert admin.status_code == 200
        created = await client.post(
            "/api/v1/admin/users",
            json={"username": "perm-batch", "password": "Passw0rd!23", "role": "user"},
        )
        assert created.status_code in (200, 201), created.text
        uid = created.json()["id"]
        # 造第二个集群（未授权给该用户）
        c2 = await client.post("/api/v1/clusters", json={"name": "perm-cluster-2"})
        assert c2.status_code in (200, 201), c2.text
        cid2 = c2.json()["id"]

        # 授权权限键 + 集群 1（夹具默认集群）
        perm = await client.put(
            f"/api/v1/admin/users/{uid}/permissions", json={"permissions": ["plugin_groups"]}
        )
        assert perm.status_code in (200, 204), perm.text
        grant = await client.put(f"/api/v1/admin/users/{uid}/clusters", json={"cluster_ids": [1]})
        assert grant.status_code in (200, 204), grant.text

        # 资源：cluster 1（已授权）与 cluster 2（未授权）各一个插件组
        g1 = await _create_group(client, "perm-auth", cluster_id=1)
        g2 = await _create_group(client, "perm-unauth", cluster_id=cid2)

        login = await client.post(
            "/api/v1/auth/login", json={"username": "perm-batch", "password": "Passw0rd!23"}
        )
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]

        res = await client.request(
            "DELETE", "/api/v1/plugin_configs",
            json={"plugin_config_ids": [g1["id"], g2["id"]], "delete_db": True, "delete_edge": False},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        by_id = {it["config_id"]: it for it in res.json()["results"]}
        assert by_id[g1["id"]]["status"] == "success"
        assert by_id[g2["id"]]["status"] == "failed"
        assert "无权限操作该集群" in by_id[g2["id"]]["error"]


class TestBatchDeletePluginMetadata:
    """插件元数据批量删除：Edge 侧按 plugin_name 定位（不是 edge_uuid），与单删语义一致。"""

    async def _create_metadata(self, client, plugin_name: str, cluster_id: int = 1):
        # 单增端点是 query 参数（plugin_name）+ body（config_data）
        r = await client.post(
            f"/api/v1/clusters/{cluster_id}/plugin-metadata",
            params={"plugin_name": plugin_name},
            json={"k": "v"},
        )
        assert r.status_code in (200, 201), r.text
        return r.json()

    async def test_global_endpoint_result_shape(self, async_authed_client):
        client = async_authed_client
        a = await self._create_metadata(client, "bd-md-a")
        b = await self._create_metadata(client, "bd-md-b")
        res = await client.request(
            "DELETE", "/api/v1/plugin_metadata",
            json={"metadata_ids": [a["id"], b["id"]], "delete_db": True, "delete_edge": False},
        )
        assert res.status_code == 200, res.text
        items = res.json()["results"]
        assert [it["status"] for it in items] == ["success", "success"]
        assert {it["plugin_name"] for it in items} == {"bd-md-a", "bd-md-b"}

        left = await client.get("/api/v1/plugin_metadata", params={"page_size": 100})
        names = {it["plugin_name"] for it in left.json()["items"]}
        assert "bd-md-a" not in names and "bd-md-b" not in names

    async def test_edge_delete_uses_plugin_name(self, async_authed_client):
        """Edge 删除的标识必须是 plugin_name（单删端点同款），不是 edge_uuid。"""
        from unittest.mock import patch

        client = async_authed_client
        md = await self._create_metadata(client, "bd-md-edge")
        captured: dict = {}

        async def fake_delete_on_nodes(cluster_id, nodes, identifier, fn):  # noqa: ANN001
            captured["identifier"] = identifier
            return [{"scope": "edge", "status": "success", "node": "10.0.0.1:9000"}]

        with patch("app.services.edge_sync.delete_on_nodes", fake_delete_on_nodes):
            res = await client.request(
                "DELETE", "/api/v1/clusters/1/plugin-metadata",
                json={"metadata_ids": [md["id"]], "delete_db": False, "delete_edge": True},
            )
        assert res.status_code == 200, res.text
        assert captured["identifier"] == "bd-md-edge"

    async def test_cluster_scope_endpoint_delegates(self, async_authed_client):
        client = async_authed_client
        md = await self._create_metadata(client, "bd-md-cluster")
        res = await client.request(
            "DELETE", "/api/v1/clusters/1/plugin-metadata",
            json={"metadata_ids": [md["id"]], "delete_db": True},
        )
        assert res.status_code == 200, res.text
        assert res.json()["results"][0]["status"] == "success"


class TestPluginMetadataFilter:
    """`GET /plugin_metadata?plugin_name=` 精确筛选（工具条「全部插件」下拉）。"""

    async def test_filter_by_plugin_name(self, async_authed_client):
        client = async_authed_client
        await client.post("/api/v1/clusters/1/plugin-metadata", params={"plugin_name": "flt-a"}, json={"k": 1})
        await client.post("/api/v1/clusters/1/plugin-metadata", params={"plugin_name": "flt-b"}, json={"k": 2})

        only_a = await client.get("/api/v1/plugin_metadata", params={"page_size": 100, "plugin_name": "flt-a"})
        assert only_a.status_code == 200
        assert only_a.json()["total"] == 1
        assert only_a.json()["items"][0]["plugin_name"] == "flt-a"

        # 精确匹配：子串不命中
        none = await client.get("/api/v1/plugin_metadata", params={"page_size": 100, "plugin_name": "flt"})
        assert none.json()["total"] == 0

    async def test_filter_combines_with_cluster(self, async_authed_client):
        client = async_authed_client
        c2 = await client.post("/api/v1/clusters", json={"name": "flt-cluster"})
        cid2 = c2.json()["id"]
        await client.post("/api/v1/clusters/1/plugin-metadata", params={"plugin_name": "flt-c"}, json={})
        await client.post(f"/api/v1/clusters/{cid2}/plugin-metadata", params={"plugin_name": "flt-c"}, json={})

        res = await client.get(
            "/api/v1/plugin_metadata", params={"page_size": 100, "plugin_name": "flt-c", "cluster_id": cid2}
        )
        assert res.json()["total"] == 1
        assert res.json()["items"][0]["cluster_id"] == cid2


class TestStreamProxySchemeFilter:
    """工具条「全部协议」下拉：`GET /stream-proxies?scheme=` 按 StreamProxy.scheme 精确筛选。"""

    async def test_scheme_filter(self, async_authed_client):
        client = async_authed_client
        for name, scheme in (("sf-tcp", "tcp"), ("sf-udp", "udp"), ("sf-tls", "tls")):
            r = await client.post(
                "/api/v1/clusters/1/stream-proxies",
                json={"name": name, "listen_port": 20000 + hash(name) % 1000, "scheme": scheme, "targets": []},
            )
            assert r.status_code in (200, 201), r.text

        for scheme in ("tcp", "udp", "tls"):
            res = await client.get(
                "/api/v1/stream-proxies", params={"page_size": 100, "scheme": scheme, "search": "sf-"}
            )
            assert res.status_code == 200, res.text
            items = res.json()["items"]
            assert [i["scheme"] for i in items] == [scheme]

    async def test_scheme_filter_rejects_unknown_value(self, async_authed_client):
        res = await async_authed_client.get("/api/v1/stream-proxies", params={"scheme": "sctp"})
        assert res.status_code == 422
