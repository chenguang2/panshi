"""插件组删除前置引用查询（openspec: plugin-group-ux-close-loop，tasks 3.1–3.2）。

契约（specs/plugin-config-delete-reference-check）：
- GET /clusters/{cluster_id}/plugin_configs/{config_id}/references 返回
  ``{ name, referenced_by: [{ route_id, route_name }] }``（被同集群路由引用清单）；
- 判定与 PLG-07 删除守卫收敛在同一 helper（比对键 Route.plugin_config_ids——
  JSON TEXT，存 edge_uuid 而非 id），MUST NOT 出现两套逻辑；
- 畸形 plugin_config_ids JSON（解析失败或非列表）按「不含引用」处理，不报错阻断
  （与 PLG-07 守卫及 cluster_backup 导入期清理语义一致）。
"""

from app.models.cluster import Route


async def _create_group(client, name):
    r = await client.post(
        "/api/v1/clusters/1/plugin_configs",
        json={"name": name, "plugins": {"ip-restriction": {"whitelist": ["10.0.0.1"]}}},
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _create_route(client, name, refs):
    r = await client.post(
        "/api/v1/clusters/1/routes",
        json={"name": name, "uri": f"/{name}/*", "plugin_config_ids": refs},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _fetch_references(client, group_id):
    return await client.get(f"/api/v1/clusters/1/plugin_configs/{group_id}/references")


class TestReferencesEndpoint:

    async def test_referenced_by_n_routes(self, async_authed_client):
        """被 N 条路由引用 → 返回全部引用路由（含 route_id/route_name），他组引用不计入。"""
        group = await _create_group(async_authed_client, "ref-multi")
        ra = await _create_route(async_authed_client, "ref-route-a", [group["edge_uuid"]])
        rb = await _create_route(async_authed_client, "ref-route-b", [group["edge_uuid"]])
        # 干扰项：引用其他插件组的路由不属于本组的 referenced_by
        other = await _create_group(async_authed_client, "ref-other")
        await _create_route(async_authed_client, "ref-route-c", [other["edge_uuid"]])

        resp = await _fetch_references(async_authed_client, group["id"])
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "ref-multi"
        got = {(i["route_id"], i["route_name"]) for i in body["referenced_by"]}
        assert got == {(ra["id"], "ref-route-a"), (rb["id"], "ref-route-b")}

    async def test_no_references_returns_empty(self, async_authed_client):
        """无引用 → referenced_by 空数组。"""
        group = await _create_group(async_authed_client, "ref-free")
        resp = await _fetch_references(async_authed_client, group["id"])
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "ref-free"
        assert body["referenced_by"] == []

    async def test_malformed_json_treated_as_no_reference(
        self, async_authed_client, isolated_session
    ):
        """畸形 plugin_config_ids（解析失败 / 合法 JSON 但非列表）按不含引用处理。"""
        group = await _create_group(async_authed_client, "ref-broken")
        # API 可构造的形态：合法 JSON 列表但内容不含本组 edge_uuid（PLG-07 同款）
        await _create_route(async_authed_client, "ref-broken-r1", ["[broken"])
        # 直改库构造 API 造不出的畸形 TEXT：解析失败 & 非列表 JSON
        async with isolated_session() as s:
            s.add(Route(cluster_id=1, name="ref-broken-r2", uri="/ref-broken-r2/*",
                        plugin_config_ids="{invalid json"))
            s.add(Route(cluster_id=1, name="ref-broken-r3", uri="/ref-broken-r3/*",
                        plugin_config_ids='{"a": 1}'))
            await s.commit()

        resp = await _fetch_references(async_authed_client, group["id"])
        assert resp.status_code == 200, resp.text
        assert resp.json()["referenced_by"] == []

    async def test_missing_group_returns_404(self, async_authed_client):
        """插件组不存在 → 404（与其他子资源端点一致）。"""
        resp = await _fetch_references(async_authed_client, 99999)
        assert resp.status_code == 404

    async def test_cross_cluster_route_not_counted(
        self, async_authed_client, isolated_session
    ):
        """跨集群引用不在检查范围（与 PLG-07 守卫同口径的已知局限）。"""
        from app.models.cluster import Cluster

        group = await _create_group(async_authed_client, "ref-cross")
        async with isolated_session() as s:
            s.add(Cluster(id=2, name="other-cluster"))
            s.add(Route(cluster_id=2, name="ref-cross-other", uri="/x/*",
                        plugin_config_ids=f'["{group["edge_uuid"]}"]'))
            await s.commit()

        resp = await _fetch_references(async_authed_client, group["id"])
        assert resp.status_code == 200, resp.text
        assert resp.json()["referenced_by"] == []
