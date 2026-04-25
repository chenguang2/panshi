import pytest
from app.models.cluster import Route, RoutePlugin, ConfigVersion
from sqlalchemy import select

async def test_create_route(test_db):
    route = Route(
        cluster_id=1,
        name="test-route",
        uri="/api/*",
        methods="GET,POST",
        priority=0,
        status=1
    )
    test_db.add(route)
    await test_db.commit()
    await test_db.refresh(route)

    assert route.id is not None
    assert route.uri == "/api/*"
    assert route.status == 1

async def test_route_with_upstream_reference(test_db):
    route = Route(
        cluster_id=1,
        upstream_id=1,
        name="proxied-route",
        uri="/proxy/*",
        priority=10
    )
    test_db.add(route)
    await test_db.commit()
    await test_db.refresh(route)

    assert route.upstream_id == 1
    assert route.priority == 10

async def test_route_with_plugins(test_db):
    route = Route(
        cluster_id=1,
        name="route-with-plugins",
        uri="/api/plugins/*",
        priority=0,
        status=1
    )
    test_db.add(route)
    await test_db.commit()
    await test_db.refresh(route)

    plugin1 = RoutePlugin(
        route_id=route.id,
        plugin_name="ip-restriction",
        config='{"whitelist": ["127.0.0.1"]}'
    )
    plugin2 = RoutePlugin(
        route_id=route.id,
        plugin_name="cors",
        config='{"allow_origins": "*"}'
    )
    test_db.add(plugin1)
    test_db.add(plugin2)
    await test_db.commit()

    assert plugin1.id is not None
    assert plugin2.id is not None
    assert plugin1.plugin_name == "ip-restriction"
    assert plugin2.plugin_name == "cors"

async def test_route_with_multiple_plugins_crud(test_db):
    route = Route(
        cluster_id=1,
        name="route-multi-plugins",
        uri="/api/multi/*",
        priority=0,
        status=1
    )
    test_db.add(route)
    await test_db.commit()
    await test_db.refresh(route)

    plugins = [
        RoutePlugin(route_id=route.id, plugin_name="ip-restriction", config='{"whitelist": ["10.0.0.1"]}'),
        RoutePlugin(route_id=route.id, plugin_name="cors", config='{"allow_origins": "http://example.com"}'),
        RoutePlugin(route_id=route.id, plugin_name="limit-req", config='{"rate": 100}'),
    ]
    for p in plugins:
        test_db.add(p)
    await test_db.commit()

    result = await test_db.execute(select(RoutePlugin).where(RoutePlugin.route_id == route.id))
    saved_plugins = result.scalars().all()
    assert len(saved_plugins) == 3

    plugin_names = {p.plugin_name for p in saved_plugins}
    assert "ip-restriction" in plugin_names
    assert "cors" in plugin_names
    assert "limit-req" in plugin_names

    for p in saved_plugins:
        await test_db.delete(p)
    await test_db.commit()

    result = await test_db.execute(select(RoutePlugin).where(RoutePlugin.route_id == route.id))
    remaining = result.scalars().all()
    assert len(remaining) == 0

async def test_config_version_save(test_db):
    config_version = ConfigVersion(
        cluster_id=1,
        resource_type="route",
        resource_id=1,
        version=1,
        config='{"name": "test-route", "uri": "/api/*"}'
    )
    test_db.add(config_version)
    await test_db.commit()
    await test_db.refresh(config_version)

    assert config_version.id is not None
    assert config_version.version == 1
    assert config_version.resource_type == "route"

async def test_config_version_multiple_versions(test_db):
    versions = [
        ConfigVersion(cluster_id=1, resource_type="route", resource_id=1, version=1, config='{"v": 1}'),
        ConfigVersion(cluster_id=1, resource_type="route", resource_id=1, version=2, config='{"v": 2}'),
        ConfigVersion(cluster_id=1, resource_type="route", resource_id=1, version=3, config='{"v": 3}'),
    ]
    for v in versions:
        test_db.add(v)
    await test_db.commit()

    result = await test_db.execute(
        select(ConfigVersion).where(
            ConfigVersion.resource_type == "route",
            ConfigVersion.resource_id == 1
        ).order_by(ConfigVersion.version.desc())
    )
    saved = result.scalars().all()
    assert len(saved) == 3
    assert saved[0].version == 3
    assert saved[1].version == 2
    assert saved[2].version == 1