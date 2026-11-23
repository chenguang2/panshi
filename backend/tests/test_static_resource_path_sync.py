"""静态资源 URL 路径随路由 URI 同步（static-resource-path-sync）。

契约（openspec/changes/static-resource-path-sync/specs/static-resource-management）：
- 路由更新提交前按 route_id 幂等回写 StaticResource.url_path = route.uri；
- 含 NULL 旧值、含「未改 URI 只保存路由」的自愈；
- SHALL NOT 推进静态资源 updated_at（不制造无意义的待发布态）；
- 路由无静态资源时为空操作。
"""

import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.api.v1.cluster_routes import update_route
from app.models.cluster import Cluster, Route, RoutePlugin
from app.models.static_resource import StaticResource
from app.schemas.route import RouteUpdate


def _fake_request():
    """update_route 只读 request.state.audit（可空）——直调时给等价结构。"""
    return SimpleNamespace(state=SimpleNamespace(audit=None))


async def _seed(test_db, *, uri="/old/*", url_path="/old/*", with_plugin=True):
    cluster = Cluster(name="path-sync-cluster", display_name="路径同步集群", status=1)
    test_db.add(cluster)
    await test_db.commit()

    route = Route(
        cluster_id=cluster.id, name="path-sync-route", uri=uri, status=1,
        current_version=1, edge_uuid="eu-path-sync",
    )
    test_db.add(route)
    await test_db.commit()
    if with_plugin:
        test_db.add(RoutePlugin(route_id=route.id, plugin_name="static_resource", config="{}"))
        await test_db.commit()

    sr = StaticResource(
        cluster_id=cluster.id, route_id=route.id, edge_uuid="eu-path-sync",
        name="path-sync-resource", url_path=url_path, current_version=1, file_size=1024,
    )
    test_db.add(sr)
    await test_db.commit()
    return cluster, route, sr


async def _reload(test_db, model, pk):
    """重新读取行（populate_existing 覆盖会话内旧值，不 expire 其它对象）。"""
    return (
        await test_db.execute(
            select(model).where(model.id == pk).execution_options(populate_existing=True)
        )
    ).scalar_one()


class TestUrlPathFollowsRouteUri:
    async def test_uri_change_updates_url_path(self, test_db):
        cluster, route, sr = await _seed(test_db)

        await update_route(
            cluster_id=cluster.id, route_id=route.id,
            route_update=RouteUpdate(uri="/webTrade/*"),
            request=_fake_request(), db=test_db,
        )

        reloaded = await _reload(test_db, StaticResource, sr.id)
        assert reloaded.url_path == "/webTrade/*"

    async def test_uri_change_does_not_touch_updated_at(self, test_db):
        """路径变更是展示元数据——不得把资源推进「待发布」态。"""
        from sqlalchemy import update as sa_update

        cluster, route, sr = await _seed(test_db)
        # 让 updated_at 明显老于「现在」，便于检测是否被 onupdate 刷新
        # （Core UPDATE 直接落库，避免在异步上下文里赋值已过期 ORM 对象触发隐式 IO）
        stale = datetime.utcnow() - timedelta(days=3)
        await test_db.execute(
            sa_update(StaticResource).where(StaticResource.id == sr.id).values(updated_at=stale)
        )
        await test_db.commit()
        before = (await _reload(test_db, StaticResource, sr.id)).updated_at
        assert before == stale

        await update_route(
            cluster_id=cluster.id, route_id=route.id,
            route_update=RouteUpdate(uri="/webTrade/*"),
            request=_fake_request(), db=test_db,
        )

        reloaded = await _reload(test_db, StaticResource, sr.id)
        assert reloaded.url_path == "/webTrade/*"
        assert reloaded.updated_at == before

    async def test_null_url_path_is_backfilled(self, test_db):
        cluster, route, sr = await _seed(test_db, url_path=None)

        await update_route(
            cluster_id=cluster.id, route_id=route.id,
            route_update=RouteUpdate(description="仅改描述"),
            request=_fake_request(), db=test_db,
        )

        assert (await _reload(test_db, StaticResource, sr.id)).url_path == "/old/*"


class TestSelfHealing:
    async def test_stale_url_path_heals_when_uri_unchanged(self, test_db):
        """存量脏行：本次不改 URI，只保存路由也应被纠正（幂等自愈）。"""
        cluster, route, sr = await _seed(test_db, uri="/webTrade/*", url_path="/*")

        await update_route(
            cluster_id=cluster.id, route_id=route.id,
            route_update=RouteUpdate(description="保存一次"),
            request=_fake_request(), db=test_db,
        )

        assert (await _reload(test_db, StaticResource, sr.id)).url_path == "/webTrade/*"


class TestNoStaticResource:
    async def test_route_without_static_resource_updates_fine(self, test_db):
        cluster, route, _sr = await _seed(test_db)
        # 删掉资源，验证空操作不报错
        await test_db.delete(_sr)
        await test_db.commit()

        resp = await update_route(
            cluster_id=cluster.id, route_id=route.id,
            route_update=RouteUpdate(uri="/renamed/*"),
            request=_fake_request(), db=test_db,
        )

        assert resp.uri == "/renamed/*"
        remaining = (await test_db.execute(
            select(StaticResource).where(StaticResource.route_id == route.id)
        )).scalars().all()
        assert remaining == []
