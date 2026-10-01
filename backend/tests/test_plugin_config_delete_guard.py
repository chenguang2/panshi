"""PLG-07：删除被路由引用的插件组必须前置阻断（与 SSL CA 删除守卫行为对齐）。

现场（2026-10-01 缺口批次核验）：`DELETE /clusters/{id}/plugin_configs/{cid}`
不扫描同集群路由的 `plugin_config_ids` 引用即删库删版本 → 被引用后路由发布
携带失效引用。契约：delete_db 腿前置校验，被引用 → 400 + 中文错误（含引用
计数与路由名提示）；无引用照常删除；路由 JSON 畸形按「不含引用」处理不 500。
"""

async def _create_group(client, name):
    r = await client.post(
        "/api/v1/clusters/1/plugin_configs",
        json={"name": name, "plugins": {"ip-restriction": {"whitelist": ["10.0.0.1"]}}},
    )
    assert r.status_code == 200, r.text  # 端点未声明 201，默认 200
    return r.json()


async def _create_route(client, name, refs):
    r = await client.post(
        "/api/v1/clusters/1/routes",
        json={"name": name, "uri": f"/{name}/*", "plugin_config_ids": refs},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _delete_group(client, group_id):
    return await client.request(
        "DELETE",
        f"/api/v1/clusters/1/plugin_configs/{group_id}",
        json={"delete_db": True},
    )


class TestDeleteReferencedPluginConfigBlocked:

    async def test_delete_referenced_group_rejected_400(self, async_authed_client):
        group = await _create_group(async_authed_client, "plg07-referenced")
        await _create_route(async_authed_client, "plg07-route-a", [group["edge_uuid"]])

        resp = await _delete_group(async_authed_client, group["id"])
        assert resp.status_code == 400, resp.text
        detail = resp.json()["detail"]
        assert "引用" in detail
        assert "plg07-route-a" in detail  # 错误须指明引用路由

        # 阻断后组仍存在、路由引用完好
        got = await async_authed_client.get(
            f"/api/v1/clusters/1/plugin_configs/{group['id']}")
        assert got.status_code == 200
        refs = (await async_authed_client.get("/api/v1/clusters/1/routes")).json()
        assert refs["total"] == 1

    async def test_delete_group_without_reference_allowed(self, async_authed_client):
        """对照组：无引用的插件组照常删除。"""
        group = await _create_group(async_authed_client, "plg07-free")
        resp = await _delete_group(async_authed_client, group["id"])
        assert resp.status_code == 200, resp.text
        got = await async_authed_client.get(
            f"/api/v1/clusters/1/plugin_configs/{group['id']}")
        assert got.status_code == 404

    async def test_multiple_references_counted_and_malformed_json_tolerated(
        self, async_authed_client
    ):
        """多路由引用 → 400 带计数；畸形 JSON 的路由按不含引用处理，不得 500。"""
        group = await _create_group(async_authed_client, "plg07-multi")
        await _create_route(async_authed_client, "plg07-multi-r1", [group["edge_uuid"]])
        await _create_route(async_authed_client, "plg07-multi-r2", [group["edge_uuid"]])
        broken = await _create_route(
            async_authed_client, "plg07-broken", ["[broken"])

        resp = await _delete_group(async_authed_client, group["id"])
        assert resp.status_code == 400, resp.text
        detail = resp.json()["detail"]
        assert "2" in detail  # 仅计有效引用（畸形 JSON 路由不计入）
        assert "plg07-multi-r1" in detail and "plg07-multi-r2" in detail
