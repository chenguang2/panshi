"""上游删除前置引用查询（批次 B2：批量删除「被路由引用」前端预检）。

契约：
- `GET /clusters/{cluster_id}/upstreams/references?ids=1,2,3` 返回
  ``{items: [{upstream_id, upstream_name, routes: [{route_id, route_name}]}]}``；
- 只列出**存在引用**的上游（无引用的不出现在 items 里——前端据此判定「全部被引用」）；
- 判定与 `delete_upstreams_batch` 的删除拦截**同语义**（``Route.upstream_id in ids``），
  MUST NOT 另造规则，否则前端预检与后端拦截会分叉；
- 不属于该集群 / 不存在的 id 静默忽略（不报错、不出现在 items，避免跨集群探测）；
- ids 必填、逗号分隔整数、上限 500（超限 400）；
- 端点须挂在集群域 router 的鉴权依赖下（未认证 401；同时登记在
  tests/test_security_guard.py 的 UNAUTHENTICATED_SAMPLES）。
"""

from app.models.cluster import Cluster, Upstream


async def _create_upstream(client, name, cluster_id=1):
    r = await client.post(
        f"/api/v1/clusters/{cluster_id}/upstreams",
        json={"name": name, "load_balance": "weighted_roundrobin"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _create_route(client, name, upstream_id, cluster_id=1):
    r = await client.post(
        f"/api/v1/clusters/{cluster_id}/routes",
        json={"name": name, "uri": f"/{name}/*", "upstream_id": upstream_id},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _refs(client, ids, cluster_id=1):
    return await client.get(
        f"/api/v1/clusters/{cluster_id}/upstreams/references",
        params={"ids": ids},
    )


class TestUpstreamReferencesEndpoint:
    async def test_referenced_upstreams_listed_with_route_names(self, async_authed_client):
        """有引用的上游 → 出现在 items 且 routes 逐条含 route_id/route_name。"""
        client = async_authed_client
        u1 = await _create_upstream(client, "ref-up-1")
        u2 = await _create_upstream(client, "ref-up-2")
        r1 = await _create_route(client, "ref-route-1", u1["id"])
        r2 = await _create_route(client, "ref-route-2", u1["id"])
        r3 = await _create_route(client, "ref-route-3", u2["id"])

        resp = await _refs(client, f"{u1['id']},{u2['id']}")
        assert resp.status_code == 200, resp.text
        by_id = {it["upstream_id"]: it for it in resp.json()["items"]}
        assert set(by_id) == {u1["id"], u2["id"]}
        assert by_id[u1["id"]]["upstream_name"] == "ref-up-1"
        assert {(x["route_id"], x["route_name"]) for x in by_id[u1["id"]]["routes"]} == {
            (r1["id"], "ref-route-1"),
            (r2["id"], "ref-route-2"),
        }
        assert [x["route_id"] for x in by_id[u2["id"]]["routes"]] == [r3["id"]]

    async def test_unreferenced_upstream_omitted(self, async_authed_client):
        """无引用 → 不出现在 items（前端据「全部在 items 里」判定全量拦截）。"""
        client = async_authed_client
        refd = await _create_upstream(client, "ref-mixed-referenced")
        free = await _create_upstream(client, "ref-mixed-free")
        await _create_route(client, "ref-mixed-route", refd["id"])

        resp = await _refs(client, f"{refd['id']},{free['id']}")
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert [it["upstream_id"] for it in items] == [refd["id"]]

    async def test_all_unreferenced_returns_empty_items(self, async_authed_client):
        client = async_authed_client
        u = await _create_upstream(client, "ref-clean")
        resp = await _refs(client, str(u["id"]))
        assert resp.status_code == 200, resp.text
        assert resp.json()["items"] == []

    async def test_missing_and_cross_cluster_ids_are_ignored(
        self, async_authed_client, isolated_session
    ):
        """不存在 id / 别的集群的 id → 静默忽略（200，不出现在 items），跨集群探测无信息。"""
        client = async_authed_client
        mine = await _create_upstream(client, "ref-mine")
        await _create_route(client, "ref-mine-route", mine["id"])

        # 集群 2 的上游（有引用），本集群查询不得泄露
        async with isolated_session() as s:
            if not await s.get(Cluster, 2):
                s.add(Cluster(id=2, name="other-cluster"))
                await s.commit()
        other = await _create_upstream(client, "ref-other-cluster", cluster_id=2)
        await _create_route(client, "ref-other-route", other["id"], cluster_id=2)

        resp = await _refs(client, f"{mine['id']},99999,{other['id']}")
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert [it["upstream_id"] for it in items] == [mine["id"]]

    async def test_cross_cluster_only_returns_empty(self, async_authed_client, isolated_session):
        """只查别的集群的 id → items 为空（而非 400/404）。"""
        client = async_authed_client
        async with isolated_session() as s:
            if not await s.get(Cluster, 2):
                s.add(Cluster(id=2, name="other-cluster"))
                await s.commit()
        other = await _create_upstream(client, "ref-only-other", cluster_id=2)
        await _create_route(client, "ref-only-other-route", other["id"], cluster_id=2)

        resp = await _refs(client, str(other["id"]))
        assert resp.status_code == 200, resp.text
        assert resp.json()["items"] == []

    async def test_db_only_upstream_without_routes_is_omitted(
        self, async_authed_client, isolated_session
    ):
        """无任何路由引用的上游不出现在 items（判定只看 Route.upstream_id）。"""
        client = async_authed_client
        async with isolated_session() as s:
            db_only = Upstream(cluster_id=1, name="ref-db-only")
            s.add(db_only)
            await s.commit()
            db_only_id = db_only.id
        resp = await _refs(client, str(db_only_id))
        assert resp.status_code == 200, resp.text
        assert resp.json()["items"] == []

    async def test_references_stay_in_sync_with_delete_guard(self, async_authed_client):
        """预检命中 ⇔ 删除拦截命中（同语义护栏：引用上游批量删除必 failed 且原因一致）。"""
        client = async_authed_client
        u = await _create_upstream(client, "ref-guard-parity")
        await _create_route(client, "ref-guard-parity-route", u["id"])

        refs = await _refs(client, str(u["id"]))
        assert [it["upstream_id"] for it in refs.json()["items"]] == [u["id"]]

        deleted = await client.request(
            "DELETE",
            "/api/v1/clusters/1/upstreams",
            json={"upstream_ids": [u["id"]], "delete_db": True, "delete_edge": False},
        )
        assert deleted.status_code == 200, deleted.text
        entry = deleted.json()["results"][0]
        assert entry["status"] == "failed"
        assert entry["error"] == "该上游已被路由引用，请先删除引用路由"


class TestUpstreamReferencesValidation:
    async def test_missing_ids_param_is_422(self, async_authed_client):
        resp = await async_authed_client.get("/api/v1/clusters/1/upstreams/references")
        assert resp.status_code == 422

    async def test_empty_ids_is_400(self, async_authed_client):
        resp = await _refs(async_authed_client, "")
        assert resp.status_code == 400
        assert "ids" in resp.json()["detail"]

    async def test_non_numeric_ids_is_400(self, async_authed_client):
        for bad in ("abc", "1,abc", "1,,2", "1;2"):
            resp = await _refs(async_authed_client, bad)
            assert resp.status_code == 400, f"ids={bad!r} 应 400，实际 {resp.status_code}"

    async def test_over_limit_is_400(self, async_authed_client):
        ids = ",".join(str(i) for i in range(1, 502))  # 501 条 > 500 上限
        resp = await _refs(async_authed_client, ids)
        assert resp.status_code == 400
        assert "500" in resp.json()["detail"]

    async def test_limit_boundary_is_accepted(self, async_authed_client):
        """恰好 500 条不算超限（边界不误伤前端整页勾选）。"""
        ids = ",".join(str(i) for i in range(1, 501))
        resp = await _refs(async_authed_client, ids)
        assert resp.status_code == 200, resp.text

    async def test_requires_authentication(self, unauthenticated_app):
        resp = unauthenticated_app.get("/api/v1/clusters/1/upstreams/references?ids=1")
        assert resp.status_code == 401


class TestUpstreamReferencesRouting:
    def test_route_declared_before_integer_path_endpoint(self):
        """源码守卫：`references` 必须声明在 `/{cluster_id}/upstreams/{upstream_id}` 之前。

        否则 FastAPI 会用整数路径参数匹配 "references" → 422（AGENTS「路径遮蔽」类教训）。
        """
        from pathlib import Path

        src = Path("app/api/v1/cluster_upstreams.py").read_text(encoding="utf-8")
        refs_pos = src.index('/upstreams/references')
        detail_pos = src.index('/{cluster_id}/upstreams/{upstream_id}"')
        assert refs_pos < detail_pos
