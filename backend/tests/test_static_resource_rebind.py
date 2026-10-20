"""static-resources-ux-close-loop 批 2 组 7：静态资源换绑路由（8.1）。

PUT /clusters/{cid}/static-resources/{rid} 支持 route_id：
- 目标不合格三态 400（未发布 / 路径不以 /* 结尾 / 未挂 static_resource 插件，复用既有文案）
- 目标已被他绑 409（带既有资源名）
- 成功换绑四字段同步：route_id / edge_uuid / name / url_path
- 仅传 description（不带 route_id）行为不变
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.v1.cluster_static_resources import update_static_resource
from app.models.cluster import Cluster, Node, Route, RoutePlugin
from app.models.static_resource import StaticResource
from app.schemas.static_resource import StaticResourceUpdate


async def _seed(test_db, with_old_route=True):
    """建集群/在线节点/(旧路由+资源)，返回 (cluster, resource)。"""
    cluster = Cluster(name="sr-rebind-cluster", display_name="换绑集群", status=1)
    test_db.add(cluster)
    await test_db.commit()
    test_db.add(Node(cluster_id=cluster.id, ip="10.2.2.2", service_port=80, management_port=9182, edge_path="/edge", status=1))
    await test_db.commit()

    if not with_old_route:
        return cluster, None

    old_route = Route(cluster_id=cluster.id, name="old-route", uri="/old/*", status=1, current_version=1, edge_uuid="eu-old")
    test_db.add(old_route)
    await test_db.commit()
    test_db.add(RoutePlugin(route_id=old_route.id, plugin_name="static_resource", config="{}"))
    sr = StaticResource(
        cluster_id=cluster.id,
        route_id=old_route.id,
        edge_uuid=old_route.edge_uuid,
        name=old_route.name,
        url_path=old_route.uri,
    )
    test_db.add(sr)
    await test_db.commit()
    return cluster, sr


async def _make_route(test_db, cluster, name, uri, *, version=1, plugin=True, edge_uuid="eu-x"):
    route = Route(cluster_id=cluster.id, name=name, uri=uri, status=1, current_version=version, edge_uuid=edge_uuid)
    test_db.add(route)
    await test_db.commit()
    if plugin:
        test_db.add(RoutePlugin(route_id=route.id, plugin_name="static_resource", config="{}"))
        await test_db.commit()
    return route


async def _rebind(test_db, cluster, sr, route_id):
    return await update_static_resource(
        cluster_id=cluster.id,
        resource_id=sr.id,
        body=StaticResourceUpdate(route_id=route_id),
        request=None,
        db=test_db,
    )


@pytest.mark.asyncio
async def test_rebind_success_updates_four_fields(test_db):
    """8.1 主路径：换绑成功四字段同步，description 可同请求更新。"""
    cluster, sr = await _seed(test_db)
    target = await _make_route(test_db, cluster, "new-route", "/new/*", edge_uuid="eu-new")

    resp = await update_static_resource(
        cluster_id=cluster.id,
        resource_id=sr.id,
        body=StaticResourceUpdate(route_id=target.id, description="换绑后描述"),
        request=None,
        db=test_db,
    )
    assert resp.route_id == target.id
    assert resp.edge_uuid == "eu-new"
    assert resp.name == "new-route"
    assert resp.url_path == "/new/*"
    assert resp.description == "换绑后描述"

    row = (await test_db.execute(select(StaticResource).where(StaticResource.id == sr.id))).scalar_one()
    assert (row.route_id, row.edge_uuid, row.name, row.url_path) == (target.id, "eu-new", "new-route", "/new/*")


@pytest.mark.asyncio
async def test_rebind_same_route_is_noop(test_db):
    """route_id 与当前相同：不触发换绑校验（幂等），描述仍可更新。"""
    cluster, sr = await _seed(test_db)
    resp = await update_static_resource(
        cluster_id=cluster.id,
        resource_id=sr.id,
        body=StaticResourceUpdate(route_id=sr.route_id, description="原路由"),
        request=None,
        db=test_db,
    )
    assert resp.route_id == sr.route_id
    assert resp.edge_uuid == "eu-old"


@pytest.mark.asyncio
async def test_rebind_unpublished_target_400(test_db):
    cluster, sr = await _seed(test_db)
    target = await _make_route(test_db, cluster, "bad-route", "/bad/*", version=None)

    with pytest.raises(HTTPException) as ei:
        await _rebind(test_db, cluster, sr, target.id)
    assert ei.value.status_code == 400
    assert "路由必须先发布到 Edge 节点" in ei.value.detail


@pytest.mark.asyncio
async def test_rebind_bad_uri_400(test_db):
    cluster, sr = await _seed(test_db)
    target = await _make_route(test_db, cluster, "bad-uri", "/bad")

    with pytest.raises(HTTPException) as ei:
        await _rebind(test_db, cluster, sr, target.id)
    assert ei.value.status_code == 400
    assert "路由路径必须以 /* 结尾" in ei.value.detail


@pytest.mark.asyncio
async def test_rebind_no_plugin_400(test_db):
    cluster, sr = await _seed(test_db)
    target = await _make_route(test_db, cluster, "no-plugin", "/np/*", plugin=False)

    with pytest.raises(HTTPException) as ei:
        await _rebind(test_db, cluster, sr, target.id)
    assert ei.value.status_code == 400
    assert "static_resource" in ei.value.detail


@pytest.mark.asyncio
async def test_rebind_route_bound_to_other_resource_409(test_db):
    cluster, sr = await _seed(test_db)
    target = await _make_route(test_db, cluster, "taken-route", "/taken/*")
    other = StaticResource(
        cluster_id=cluster.id,
        route_id=target.id,
        edge_uuid=target.edge_uuid,
        name="taken-sr",
        url_path=target.uri,
    )
    test_db.add(other)
    await test_db.commit()

    with pytest.raises(HTTPException) as ei:
        await _rebind(test_db, cluster, sr, target.id)
    assert ei.value.status_code == 409
    assert "taken-sr" in ei.value.detail


@pytest.mark.asyncio
async def test_update_description_only_keeps_binding(test_db):
    """回归红线：不带 route_id 的 PUT（仅描述）不触碰绑定字段。"""
    cluster, sr = await _seed(test_db)
    resp = await update_static_resource(
        cluster_id=cluster.id,
        resource_id=sr.id,
        body=StaticResourceUpdate(description="只改描述"),
        request=None,
        db=test_db,
    )
    assert resp.route_id == sr.route_id
    assert resp.edge_uuid == "eu-old"
    assert resp.name == "old-route"
    assert resp.url_path == "/old/*"
    assert resp.description == "只改描述"
