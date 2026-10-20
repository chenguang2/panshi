"""静态资源路由绑定冲突 409 文案（static-resources-ux-close-loop 任务 1.4）。

409 detail 必须带出冲突资源名与处置指引：用户看到「该路由已关联静态资源」
时无法判断下一步是删资源还是换路由（评审 2026-10-20）。
"""

import pytest

pytestmark = pytest.mark.asyncio


async def _seed_published_route_with_resource(session_factory) -> tuple[int, str]:
    """播种集群 1 + 已发布路由（挂 static_resource 插件）+ 已关联静态资源，返回 (route_id, 资源名)。"""
    from app.models.cluster import Cluster, Route, RoutePlugin
    from app.models.static_resource import StaticResource

    async with session_factory() as s:
        if await s.get(Cluster, 1) is None:
            s.add(Cluster(id=1, name="conflict-cluster"))
        route = Route(
            id=9001,
            cluster_id=1,
            name="docs-route",
            uri="/docs/*",
            current_version=3,
        )
        s.add(route)
        s.add(RoutePlugin(route_id=9001, plugin_name="static_resource", config="{}"))
        s.add(
            StaticResource(
                id=9002,
                cluster_id=1,
                route_id=9001,
                edge_uuid=route.edge_uuid,
                name="docs-route",
                url_path="/docs/*",
            )
        )
        await s.commit()
        return 9001, "docs-route"


async def test_create_conflict_detail_names_resource_and_next_step(async_authed_client, isolated_session):
    route_id, resource_name = await _seed_published_route_with_resource(isolated_session)

    resp = await async_authed_client.post(
        "/api/v1/clusters/1/static-resources",
        json={"route_id": route_id, "description": "重复绑定"},
    )

    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert resource_name in detail, f"409 detail 应带出冲突资源名，实际: {detail}"
    assert "请先删除该资源或更换路由" in detail, f"409 detail 应给出处置指引，实际: {detail}"
