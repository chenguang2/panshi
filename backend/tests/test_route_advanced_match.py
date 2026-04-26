import pytest
from app.models.cluster import Route


class TestRouteAdvancedMatch:

    async def test_create_route_with_priority_and_vars(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-with-advanced-match",
            uri="/api/advanced/*",
            priority=10,
            vars='[["header", "Host", "==", "example.com"]]',
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        assert route.id is not None
        assert route.priority == 10
        assert route.vars is not None
        assert "example.com" in route.vars

    async def test_create_route_without_advanced_match(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-basic",
            uri="/api/basic/*",
            priority=0,
            vars=None,
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        assert route.id is not None
        assert route.priority == 0
        assert route.vars is None

    async def test_update_route_disable_advanced_match(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-to-disable",
            uri="/api/to-disable/*",
            priority=5,
            vars='[["header", "X-Custom", "==", "value"]]',
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        route.priority = 0
        route.vars = None
        await test_db.commit()
        await test_db.refresh(route)

        assert route.priority == 0
        assert route.vars is None

    async def test_update_route_change_priority_only(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-priority-change",
            uri="/api/priority/*",
            priority=5,
            vars=None,
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        route.priority = 20
        await test_db.commit()
        await test_db.refresh(route)

        assert route.priority == 20
        assert route.vars is None

    async def test_update_route_change_vars_only(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-vars-change",
            uri="/api/vars/*",
            priority=0,
            vars='[["query", "page", "==", "1"]]',
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        route.vars = '[["header", "Authorization", "~~", "Bearer"]]'
        await test_db.commit()
        await test_db.refresh(route)

        assert route.priority == 0
        assert "Authorization" in route.vars

    async def test_route_with_multiple_vars(self, test_db):
        vars_json = '[["header", "Host", "==", "api.example.com"], ["query", "version", "==", "v2"], ["cookie", "session", "!=", "invalid"]]'
        route = Route(
            cluster_id=1,
            name="route-multi-vars",
            uri="/api/multi/*",
            priority=15,
            vars=vars_json,
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        assert route.priority == 15
        assert "api.example.com" in route.vars
        assert "version" in route.vars
        assert "session" in route.vars

    async def test_route_priority_default_zero(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-default-priority",
            uri="/api/default/*",
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        assert route.priority == 0

    async def test_route_vars_null_vs_empty(self, test_db):
        route_null = Route(
            cluster_id=1,
            name="route-null-vars",
            uri="/api/null-vars/*",
            vars=None,
            status=1
        )
        test_db.add(route_null)
        await test_db.commit()
        await test_db.refresh(route_null)

        route_empty = Route(
            cluster_id=1,
            name="route-empty-vars",
            uri="/api/empty-vars/*",
            vars='[]',
            status=1
        )
        test_db.add(route_empty)
        await test_db.commit()
        await test_db.refresh(route_empty)

        assert route_null.vars is None
        assert route_empty.vars == '[]'


class TestRouteVarsEmptyArrayFix:

    async def test_create_route_with_empty_vars_list(self, test_db):
        import json
        route = Route(
            cluster_id=1,
            name="route-empty-vars-api",
            uri="/api/empty-api/*",
            vars='[]',
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        assert route.id is not None
        assert route.vars == '[]'
        parsed_vars = json.loads(route.vars) if route.vars else None
        assert parsed_vars == []

    async def test_update_route_empty_vars_to_null(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-empty-to-null",
            uri="/api/empty-null/*",
            vars='[]',
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        route.vars = None
        await test_db.commit()
        await test_db.refresh(route)

        assert route.vars is None

    async def test_update_route_null_to_empty_vars(self, test_db):
        route = Route(
            cluster_id=1,
            name="route-null-to-empty",
            uri="/api/null-empty/*",
            vars=None,
            status=1
        )
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)

        route.vars = '[]'
        await test_db.commit()
        await test_db.refresh(route)

        assert route.vars == '[]'