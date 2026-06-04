import pytest
import json
from unittest.mock import MagicMock, patch
from sqlalchemy import select
from app.models.cluster import Upstream, UpstreamTarget, Route, RoutePlugin, PluginConfig, GlobalRule, Node
from app.models.edge_import import ImportLog


SAMPLE_PANSHI_VALUE = lambda d: {"value": d, "key": f"/panshi/{d.get('id','')}"}

SAMPLE_EDGE_UPSTREAMS = [SAMPLE_PANSHI_VALUE(d) for d in [
    {
        "id": "uuid-upstream-1",
        "name": "user-service",
        "type": "roundrobin",
        "nodes": {"10.0.0.1:8080": 100, "10.0.0.2:8080": 80},
        "hash_on": "vars",
        "key": "remote_addr",
        "pass_host": "pass",
        "scheme": "http",
        "retries": 3,
        "timeout": {"connect": 5, "send": 10, "read": 15},
    },
    {
        "id": "uuid-upstream-2",
        "name": "order-service",
        "type": "chash",
        "nodes": {"10.0.0.3:8080": 100},
        "hash_on": "vars",
        "key": "arg_user_id",
    },
]]

SAMPLE_EDGE_ROUTES = [SAMPLE_PANSHI_VALUE(d) for d in [
    {
        "id": "uuid-route-1",
        "name": "get-users",
        "uri": "/api/users",
        "methods": ["GET"],
        "hosts": ["api.example.com"],
        "priority": 10,
        "upstream_id": "uuid-upstream-1",
        "plugins": {
            "limit-req": {"rate": 10, "burst": 20},
            "cors": {"origins": "*"},
            "custom-auth": {"url": "/auth", "timeout": 5},
        },
        "status": 1,
    },
    {
        "id": "uuid-route-2",
        "name": "create-order",
        "uri": "/api/orders",
        "methods": ["POST"],
        "priority": 5,
        "upstream_id": "uuid-upstream-2",
        "plugins": {
            "proxy_rewrite": {"uri": "/v2/orders"},
        },
        "status": 1,
    },
]]

SAMPLE_EDGE_PLUGIN_CONFIGS = [
    {
        "key": "/panshi/plugin_configs/uuid-pc-1",
        "value": {
            "plugins": {"cors": {"origins": "*"}, "my-ratelimit": {"rate": 100}},
            "desc": "Common CORS config",
        },
    }
]

SAMPLE_EDGE_GLOBAL_RULES = [
    {
        "key": "/panshi/global_rules/uuid-gr-1",
        "value": {
            "plugins": {"monitor": {"log_all": True}},
            "desc": "Global monitor",
        },
    }
]

SAMPLE_EDGE_PLUGINS_LIST = [
    {"name": "limit-req"}, {"name": "cors"}, {"name": "proxy_rewrite"},
    {"name": "monitor"}, {"name": "custom-auth"}, {"name": "my-ratelimit"},
]


def _mock_client_with_requests(base_mock, pc_val, gr_val, pm_val):
    """Helper: set _request side_effect so fetch_edge_data works."""
    def _request_side_effect(method, path):
        if path == "/edge/admin/plugin_configs":
            return pc_val
        if path == "/edge/admin/global_rules":
            return gr_val
        if path == "/edge/admin/plugin_metadata":
            return pm_val
        return {}
    base_mock._request.side_effect = _request_side_effect
    return base_mock


class TestEdgeImportConverters:
    """Test single converter methods without EdgeImportService initialization."""

    def test_parse_resource_list_node_dir_format(self):
        from app.services.edge_import_service import EdgeImportService

        resp = {"node": {"dir": True, "nodes": [{"value": {"id": "u1", "name": "up1"}}]}}
        result = EdgeImportService._parse_resource_list(resp)
        assert len(result) == 1

    def test_parse_resource_list_list_format(self):
        from app.services.edge_import_service import EdgeImportService

        resp = {"list": [{"value": {"id": "u1", "name": "up1"}}], "total": 1}
        result = EdgeImportService._parse_resource_list(resp)
        assert len(result) == 1

    def test_parse_resource_list_nodes_format(self):
        from app.services.edge_import_service import EdgeImportService

        resp = {"nodes": [{"id": "u1", "name": "up1"}]}
        result = EdgeImportService._parse_resource_list(resp)
        assert len(result) == 1

    def test_parse_resource_list_empty(self):
        from app.services.edge_import_service import EdgeImportService

        assert EdgeImportService._parse_resource_list({}) == []
        assert EdgeImportService._parse_resource_list(None) == []
        assert EdgeImportService._parse_resource_list("not a dict") == []

    def test_parse_resource_list_direct_list(self):
        from app.services.edge_import_service import EdgeImportService

        result = EdgeImportService._parse_resource_list([{"id": "u1"}])
        assert len(result) == 1

    def test_unwrap_panshi_items_value_key(self):
        from app.services.edge_import_service import EdgeImportService

        items = [{"value": {"id": "u1", "name": "up1"}, "key": "/panshi/u1"}]
        result = EdgeImportService._unwrap_panshi_items(items)
        assert result == [{"id": "u1", "name": "up1"}]

    def test_unwrap_panshi_items_already_unwrapped(self):
        from app.services.edge_import_service import EdgeImportService

        items = [{"id": "u1", "name": "up1"}]
        result = EdgeImportService._unwrap_panshi_items(items)
        assert result == items

    def test_unwrap_panshi_items_empty(self):
        from app.services.edge_import_service import EdgeImportService

        assert EdgeImportService._unwrap_panshi_items([]) == []

    @patch("app.services.edge_import_service._load_builtin_names")
    def test_classify_plugins_all_known(self, mock_load):
        mock_load.return_value = {"cors", "limit-req", "proxy_rewrite"}
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        plugins = {
            "cors": {"origins": "*"},
            "limit-req": {"rate": 10},
        }
        result = service.classify_plugins(plugins)
        assert result["known_count"] == 2
        assert result["unknown_count"] == 0
        assert result["unknown_names"] == []

    @patch("app.services.edge_import_service._load_builtin_names")
    def test_classify_plugins_mixed(self, mock_load):
        mock_load.return_value = {"cors", "limit-req"}
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        plugins = {
            "cors": {"origins": "*"},
            "custom-auth": {"url": "/auth"},
            "my-plugin": {"key": "val"},
        }
        result = service.classify_plugins(plugins)
        assert result["known_count"] == 1
        assert result["unknown_count"] == 2
        assert "custom-auth" in result["unknown_names"]
        assert "my-plugin" in result["unknown_names"]

    @patch("app.services.edge_import_service._load_builtin_names")
    def test_classify_plugins_empty(self, mock_load):
        mock_load.return_value = {"cors"}
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        result = service.classify_plugins({})
        assert result["known_count"] == 0
        assert result["unknown_count"] == 0

    _unwrap = staticmethod(lambda v: v["value"] if isinstance(v, dict) and "value" in v else v)

    def test_convert_upstream_roundrobin(self):
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        result = service.convert_upstream(self._unwrap(SAMPLE_EDGE_UPSTREAMS[0]))

        u = result["upstream"]
        assert u["name"] == "user-service"
        assert u["load_balance"] == "weighted_roundrobin"
        assert u["edge_uuid"] == "uuid-upstream-1"
        assert u["cluster_id"] == 1
        assert u["current_version"] is None

        targets = result["targets"]
        assert len(targets) == 2
        assert targets[0]["target"] in ("10.0.0.1:8080", "10.0.0.2:8080")
        assert targets[0]["weight"] in (100, 80)

    def test_convert_upstream_chash(self):
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        result = service.convert_upstream(self._unwrap(SAMPLE_EDGE_UPSTREAMS[1]))

        u = result["upstream"]
        assert u["name"] == "order-service"
        assert u["load_balance"] == "chash"
        assert u["hash_on"] == "vars"
        assert u["key"] == "arg_user_id"

    def test_convert_upstream_name_fallback_to_id(self):
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        result = service.convert_upstream({"id": "no-name-upstream", "type": "roundrobin"})
        assert result["upstream"]["name"] == "no-name-upstream"

    def test_convert_upstream_name_empty_fallback(self):
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        result = service.convert_upstream({"id": "u-1", "name": "", "type": "roundrobin"})
        assert result["upstream"]["name"] == "u-1"

    def test_convert_plugin_metadata_from_key(self):
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        edge_pm = {
            "key": "/panshi/plugin_metadata/limit-req",
            "value": {"rate": 10, "burst": 20},
        }
        result = service.convert_plugin_metadata(edge_pm)
        assert result["plugin_metadata"]["plugin_name"] == "limit-req"
        assert result["raw_plugins"] == {"rate": 10, "burst": 20}

    def test_convert_plugin_metadata_with_logs(self):
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        edge_pm = {
            "key": "/panshi/plugin_metadata/log_process",
            "value": {"logs": {"logs/process.log": {"formats": ["${req_line}"]}}},
        }
        result = service.convert_plugin_metadata(edge_pm)
        assert result["plugin_metadata"]["plugin_name"] == "log_process"
        assert result["raw_plugins"]["logs"]["logs/process.log"]["formats"][0] == "${req_line}"

    def test_convert_plugin_metadata_missing_key(self):
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        result = service.convert_plugin_metadata({"value": {"id": "test-plugin"}})
        assert result["plugin_metadata"]["plugin_name"] == "test-plugin"

    @patch("app.services.edge_import_service._load_builtin_names")
    def test_convert_route_with_plugins(self, mock_load):
        mock_load.return_value = {"limit-req", "cors", "proxy_rewrite"}
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        upstream_uuid_map = {"uuid-upstream-1": 42}

        result = service.convert_route(self._unwrap(SAMPLE_EDGE_ROUTES[0]), upstream_uuid_map)

        r = result["route"]
        assert r["name"] == "get-users"
        assert r["uri"] == "/api/users"
        assert r["methods"] == "GET"
        assert r["hosts"] == "api.example.com"
        assert r["priority"] == 10
        assert r["upstream_id"] == 42
        assert r["edge_uuid"] == "uuid-route-1"

        plugins = result["plugins"]
        assert len(plugins) == 3
        plugin_names = [p["plugin_name"] for p in plugins]
        assert "limit-req" in plugin_names
        assert "cors" in plugin_names
        assert "custom-auth" in plugin_names

        ps = result["plugin_summary"]
        assert ps["known_count"] == 2
        assert ps["unknown_count"] == 1
        assert "custom-auth" in ps["unknown_names"]

    @patch("app.services.edge_import_service._load_builtin_names")
    def test_convert_route_no_upstream_ref(self, mock_load):
        mock_load.return_value = {"proxy_rewrite"}
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        route = dict(self._unwrap(SAMPLE_EDGE_ROUTES[1]))
        route.pop("upstream_id", None)

        result = service.convert_route(route, {})
        assert result["route"]["upstream_id"] is None

    def test_convert_plugin_config(self):
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        result = service.convert_plugin_config(SAMPLE_EDGE_PLUGIN_CONFIGS[0])

        pc = result["plugin_config"]
        assert pc["edge_uuid"] == "uuid-pc-1"
        assert pc["cluster_id"] == 1
        assert pc["current_version"] is None
        assert pc["name"] == "uuid-pc-1"

    def test_convert_global_rule(self):
        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        result = service.convert_global_rule(SAMPLE_EDGE_GLOBAL_RULES[0])

        gr = result["global_rule"]
        assert gr["edge_uuid"] == "uuid-gr-1"
        assert gr["cluster_id"] == 1
        assert gr["current_version"] is None


class TestEdgeImportConflictDetection:
    @pytest.mark.asyncio
    async def test_detect_name_conflict_upstream(self, test_db):
        upstream = Upstream(
            name="user-service", edge_uuid="existing-uuid",
            cluster_id=1, load_balance="weighted_roundrobin",
        )
        test_db.add(upstream)
        await test_db.commit()

        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        service.db_session = test_db

        preview_data = {
            "converted_upstreams": [
                {
                    "upstream": {
                        "name": "user-service",
                        "edge_uuid": "uuid-upstream-1",
                    }
                },
                {
                    "upstream": {
                        "name": "new-service",
                        "edge_uuid": "uuid-upstream-2",
                    }
                },
            ],
            "converted_routes": [],
            "converted_plugin_configs": [],
            "converted_global_rules": [],
        }

        conflicts = await service.detect_conflicts(preview_data)
        name_conflicts = [c for c in conflicts if c["type"] == "name_conflict"]
        assert len(name_conflicts) == 1
        assert name_conflicts[0]["resource_name"] == "user-service"

    @pytest.mark.asyncio
    async def test_detect_uuid_conflict(self, test_db):
        upstream = Upstream(
            name="existing", edge_uuid="uuid-upstream-1",
            cluster_id=1, load_balance="weighted_roundrobin",
        )
        test_db.add(upstream)
        await test_db.commit()

        from app.services.edge_import_service import EdgeImportService

        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        service.db_session = test_db

        preview_data = {
            "converted_upstreams": [
                {"upstream": {"name": "user-service", "edge_uuid": "uuid-upstream-1"}}
            ],
            "converted_routes": [],
            "converted_plugin_configs": [],
            "converted_global_rules": [],
        }

        conflicts = await service.detect_conflicts(preview_data)
        uuid_conflicts = [c for c in conflicts if c["type"] == "uuid_conflict"]
        assert len(uuid_conflicts) == 1
        assert uuid_conflicts[0]["resource_name"] == "user-service"

    @pytest.mark.asyncio
    async def test_execute_import_success(self, test_db):
        mock_client = MagicMock()
        mock_client.list_upstreams.return_value = SAMPLE_EDGE_UPSTREAMS
        mock_client._parse_node_list.return_value = SAMPLE_EDGE_UPSTREAMS
        mock_client.list_routes.return_value = SAMPLE_EDGE_ROUTES
        _mock_client_with_requests(
            mock_client, SAMPLE_EDGE_PLUGIN_CONFIGS, SAMPLE_EDGE_GLOBAL_RULES,
            [{"key": "/panshi/plugin_metadata/test-pm", "value": {"id": "test-pm"}}],
        )
        mock_client.api_key = "test-key"

        from app.services.edge_import_service import EdgeImportService

        with patch.object(EdgeImportService, "client", mock_client, create=True):
            service = object.__new__(EdgeImportService)
            service.cluster_id = 1
            service.node_id = 1
            service.ip = "10.0.0.1"
            service.port = 9180
            service.edge_path = "/usr/local/panshi"
            service.db_session = test_db

            class MockSelections:
                upstreams = True
                routes = True
                plugin_configs = True
                global_rules = True
                plugin_metadata = True

            result = await service.execute_import(
                selections=MockSelections(),
                session=test_db,
            )

        assert result["success"] is True
        assert result["imported_counts"]["upstreams"] == 2
        assert result["imported_counts"]["routes"] == 2
        assert result["imported_counts"]["plugin_configs"] == 1
        assert result["imported_counts"]["global_rules"] == 1
        assert result["import_log_id"] is not None

        upstreams = (await test_db.execute(select(Upstream))).scalars().all()
        assert len(upstreams) == 2

        routes = (await test_db.execute(select(Route))).scalars().all()
        assert len(routes) == 2

        route_plugins = (await test_db.execute(select(RoutePlugin))).scalars().all()
        assert len(route_plugins) == 4  # 3 + 1 plugins across 2 routes

        log = (await test_db.execute(select(ImportLog))).scalars().first()
        assert log is not None
        assert log.status == "success"

    @pytest.mark.asyncio
    async def test_execute_import_partial_selection(self, test_db):
        """Only import upstreams and routes, skip plugin_configs and global_rules."""
        mock_client = MagicMock()
        mock_client.list_upstreams.return_value = SAMPLE_EDGE_UPSTREAMS[:1]
        mock_client._parse_node_list.return_value = SAMPLE_EDGE_UPSTREAMS[:1]
        mock_client.list_routes.return_value = SAMPLE_EDGE_ROUTES[:1]
        mock_client.list_plugin_configs.return_value = SAMPLE_EDGE_PLUGIN_CONFIGS
        mock_client.list_global_rules.return_value = SAMPLE_EDGE_GLOBAL_RULES
        mock_client.api_key = "test-key"

        from app.services.edge_import_service import EdgeImportService

        with patch.object(EdgeImportService, "client", mock_client, create=True):
            service = object.__new__(EdgeImportService)
            service.cluster_id = 1
            service.node_id = 2
            service.ip = "10.0.0.2"
            service.port = 9180
            service.edge_path = "/edge/node2"
            service.db_session = test_db

            class MockSelectionsPartial:
                upstreams = True
                routes = True
                plugin_configs = False
                global_rules = False
                plugin_metadata = False

            result = await service.execute_import(
                selections=MockSelectionsPartial(),
                session=test_db,
            )

        assert result["success"] is True
        assert result["imported_counts"]["upstreams"] == 1
        assert result["imported_counts"]["routes"] == 1
        assert result["imported_counts"]["plugin_configs"] == 0
        assert result["imported_counts"]["global_rules"] == 0

        pcs = (await test_db.execute(select(PluginConfig))).scalars().all()
        assert len(pcs) == 0

        grs = (await test_db.execute(select(GlobalRule))).scalars().all()
        assert len(grs) == 0

    @pytest.mark.asyncio
    async def test_execute_import_name_conflict_resolution(self, test_db):
        existing = Upstream(
            name="user-service", edge_uuid="existing-uuid",
            cluster_id=1, load_balance="weighted_roundrobin",
        )
        test_db.add(existing)
        await test_db.commit()

        mock_client = MagicMock()
        mock_client.list_upstreams.return_value = SAMPLE_EDGE_UPSTREAMS[:1]
        mock_client._parse_node_list.return_value = SAMPLE_EDGE_UPSTREAMS[:1]
        mock_client.list_routes.return_value = []
        mock_client.list_plugin_configs.return_value = []
        mock_client.list_global_rules.return_value = []
        mock_client.api_key = "test-key"

        from app.services.edge_import_service import EdgeImportService

        with patch.object(EdgeImportService, "client", mock_client, create=True):
            service = object.__new__(EdgeImportService)
            service.cluster_id = 1
            service.node_id = 3
            service.ip = "10.0.0.3"
            service.port = 9180
            service.edge_path = "/edge/node3"
            service.db_session = test_db

            class MockSelections:
                upstreams = True
                routes = False
                plugin_configs = False
                global_rules = False
                plugin_metadata = False

            result = await service.execute_import(
                selections=MockSelections(),
                session=test_db,
            )

        assert result["success"] is True
        assert result["imported_counts"]["upstreams"] == 0

        upstreams = (await test_db.execute(select(Upstream))).scalars().all()
        names = [u.name for u in upstreams]
        assert names == ["user-service"]

    @pytest.mark.asyncio
    async def test_execute_import_rollback_on_failure(self, test_db):
        """Test that on failure, no data is committed."""
        mock_client = MagicMock()
        mock_client.list_upstreams.side_effect = Exception("Connection refused")
        mock_client.api_key = "test-key"

        from app.services.edge_import_service import EdgeImportService

        with patch.object(EdgeImportService, "client", mock_client, create=True):
            service = object.__new__(EdgeImportService)
            service.cluster_id = 1
            service.node_id = 4
            service.ip = "10.0.0.4"
            service.port = 9180
            service.edge_path = "/edge/node4"
            service.db_session = test_db

            class MockSelections:
                upstreams = True
                routes = True
                plugin_configs = True
                global_rules = True
                plugin_metadata = True

            result = await service.execute_import(
                selections=MockSelections(),
                session=test_db,
            )

        assert result["success"] is False
        assert result["import_log_id"] is not None

        upstreams = (await test_db.execute(select(Upstream))).scalars().all()
        assert len(upstreams) == 0

        log_entry = await test_db.get(ImportLog, result["import_log_id"])
        assert log_entry is not None
        assert log_entry.status == "failed"
        assert "Connection refused" in (log_entry.error_message or "")

    @pytest.mark.asyncio
    async def test_execute_import_existing_node_updated(self, test_db):
        existing_node = Node(
            cluster_id=1, ip="10.0.0.5", management_port=9180,
            service_port=80, edge_path="/old/path", status=1,
        )
        test_db.add(existing_node)
        await test_db.commit()

        mock_client = MagicMock()
        mock_client.list_upstreams.return_value = []
        mock_client.list_routes.return_value = []
        mock_client.list_plugin_configs.return_value = []
        mock_client.list_global_rules.return_value = []
        mock_client.api_key = "test-key"

        from app.services.edge_import_service import EdgeImportService

        with patch.object(EdgeImportService, "client", mock_client, create=True):
            service = object.__new__(EdgeImportService)
            service.cluster_id = 1
            service.node_id = existing_node.id
            service.ip = "10.0.0.5"
            service.port = 9180
            service.edge_path = "/old/path"
            service.db_session = test_db

            class MockSelections:
                upstreams = False
                routes = False
                plugin_configs = False
                global_rules = False
                plugin_metadata = False

            result = await service.execute_import(
                selections=MockSelections(),
                session=test_db,
            )

        assert result["success"] is True


@pytest.mark.asyncio
async def test_execute_import_route_plugin_group_mapping(test_db):
    """Verify imported route's plugin_config_ids matches plugin_config's edge_uuid."""
    SAMPLE_PC = [{"value": {"plugins": {"cors": {"origins": "*"}}, "desc": "test"}, "key": "/panshi/plugin_configs/pc-9100"}]
    SAMPLE_ROUTE = [{"value": {"id": "route-1", "name": "test-route", "uri": "/9100", "plugin_config_ids": ["pc-9100"], "plugins": {}}, "key": "/panshi/routes/route-1"}]

    mock_client = MagicMock()
    mock_client.list_upstreams.return_value = []
    mock_client._parse_node_list.return_value = []
    mock_client.list_routes.return_value = SAMPLE_ROUTE
    _mock_client_with_requests(mock_client, SAMPLE_PC, [], [])
    mock_client.api_key = "test-key"

    from app.services.edge_import_service import EdgeImportService

    with patch.object(EdgeImportService, "client", mock_client, create=True):
        service = object.__new__(EdgeImportService)
        service.cluster_id = 1
        service.node_id = 1
        service.ip = "10.0.0.1"
        service.port = 9180
        service.edge_path = "/usr/local/panshi"
        service.db_session = test_db

        class MockSelections:
            upstreams = False
            routes = True
            plugin_configs = True
            global_rules = False
            plugin_metadata = False

        result = await service.execute_import(
            selections=MockSelections(),
            session=test_db,
        )

    assert result["success"] is True
    assert result["imported_counts"]["plugin_configs"] == 1
    assert result["imported_counts"]["routes"] == 1

    pcs = (await test_db.execute(select(PluginConfig))).scalars().all()
    assert len(pcs) == 1
    assert pcs[0].edge_uuid == "pc-9100"

    routes = (await test_db.execute(select(Route))).scalars().all()
    assert len(routes) == 1
    import json
    pc_ids = json.loads(routes[0].plugin_config_ids)
    assert isinstance(pc_ids, list)
    assert len(pc_ids) == 1
    assert pc_ids[0] == "pc-9100"
    assert pc_ids[0] == pcs[0].edge_uuid


@pytest.mark.asyncio
async def test_preview_import_with_mocked_client(test_db):
    """Test preview_import returns correctly structured data."""
    mock_client = MagicMock()
    mock_client.list_upstreams.return_value = SAMPLE_EDGE_UPSTREAMS
    mock_client._parse_node_list.return_value = SAMPLE_EDGE_UPSTREAMS
    mock_client.list_routes.return_value = SAMPLE_EDGE_ROUTES
    _mock_client_with_requests(
        mock_client, SAMPLE_EDGE_PLUGIN_CONFIGS, SAMPLE_EDGE_GLOBAL_RULES,
        [{"key": "/panshi/plugin_metadata/test-pm", "value": {"id": "test-pm"}}],
    )
    mock_client.list_plugins.return_value = SAMPLE_EDGE_PLUGINS_LIST
    mock_client.api_key = "test-key"

    from app.services.edge_import_service import EdgeImportService

    with patch.object(EdgeImportService, "client", mock_client, create=True):
        with patch("app.services.edge_import_service._load_builtin_names") as mock_load:
            mock_load.return_value = {"limit-req", "cors", "proxy_rewrite", "monitor"}
            service = object.__new__(EdgeImportService)
            service.cluster_id = 1
            service.ip = "10.0.0.6"
            service.port = 9180
            service.api_key = "test-key"
            service.db_session = test_db

            mock_sync_db = MagicMock()
            mock_sync_db.query.return_value.filter.return_value.first.return_value = None
            service._get_sync_db = MagicMock(return_value=mock_sync_db)

            preview = await service.preview_import()

    assert "upstreams" in preview
    assert "routes" in preview
    assert "plugin_configs" in preview
    assert "global_rules" in preview
    assert "conflicts" in preview
    assert "plugin_summary" in preview

    assert len(preview["upstreams"]) == 2
    assert len(preview["routes"]) == 2
    assert len(preview["plugin_configs"]) == 1
    assert len(preview["global_rules"]) == 1

    ps = preview["plugin_summary"]
    assert ps["unknown_count"] > 0
    assert "custom-auth" in ps["unknown_plugin_names"]


class TestConnectionResponse:
    def test_test_connection_response_includes_all_counts(self):
        from app.schemas.edge_import import TestConnectionResponse
        resp = TestConnectionResponse(
            success=True, version="1.0",
            plugin_count=5, route_count=3, upstream_count=2,
            plugin_config_count=4, global_rule_count=1, plugin_metadata_count=6,
        )
        assert resp.plugin_config_count == 4
        assert resp.global_rule_count == 1
        assert resp.plugin_metadata_count == 6

    def test_test_connection_response_includes_extra_fields(self):
        resp = {
            "success": True,
            "version": "v3.2.1",
            "plugin_count": 10,
            "route_count": 5,
            "upstream_count": 3,
            "node": "10.0.0.1:9180",
            "cluster_name": "prod-cluster",
            "response_time_ms": 12,
        }
        from app.schemas.edge_import import TestConnectionResponse
        validated = TestConnectionResponse(**resp)
        assert validated.node == "10.0.0.1:9180"
        assert validated.cluster_name == "prod-cluster"
        assert validated.response_time_ms == 12


class TestAdminKeyOverride:
    """Test admin_key override in request schemas and service."""

    def test_test_connection_request_accepts_admin_key(self):
        from app.schemas.edge_import import TestConnectionRequest
        req = TestConnectionRequest(cluster_id=1, node_id=2, admin_key="my-key")
        assert req.admin_key == "my-key"
        req2 = TestConnectionRequest(cluster_id=1, node_id=2)
        assert req2.admin_key is None

    def test_import_execute_request_accepts_admin_key(self):
        from app.schemas.edge_import import ImportExecuteRequest
        req = ImportExecuteRequest(cluster_id=1, node_id=2, admin_key="my-key")
        assert req.admin_key == "my-key"
        req2 = ImportExecuteRequest(cluster_id=1, node_id=2)
        assert req2.admin_key is None

    def test_preview_request_schema(self):
        from app.schemas.edge_import import PreviewRequest
        req = PreviewRequest(cluster_id=1, node_id=2, admin_key="custom-key")
        assert req.admin_key == "custom-key"
        assert req.cluster_id == 1
        assert req.node_id == 2
        req2 = PreviewRequest(cluster_id=1, node_id=2)
        assert req2.admin_key is None

    @pytest.mark.asyncio
    async def test_edge_import_service_create_accepts_admin_key(self, test_db):
        import inspect
        from app.services.edge_import_service import EdgeImportService
        sig = inspect.signature(EdgeImportService.create)
        assert "admin_key" in sig.parameters
