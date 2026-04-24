import pytest
from app.models.cluster import Route

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