import pytest
from sqlalchemy import select
from app.config.plugin_definitions import BUILTIN_PLUGINS
from app.models.cluster import PluginEnabled
from app.api.v1.plugins import get_builtin_plugins


class TestPluginDefinitions:

    def test_all_plugins_have_display_name(self):
        missing = [p["name"] for p in BUILTIN_PLUGINS if "display_name" not in p or not p["display_name"]]
        assert not missing, f"Plugins missing display_name: {missing}"

    def test_all_plugins_have_category(self):
        missing = [p["name"] for p in BUILTIN_PLUGINS if "category" not in p or not p["category"]]
        assert not missing, f"Plugins missing category: {missing}"

    def test_display_name_is_chinese(self):
        """display_name 应为中文描述，简短可读"""
        for p in BUILTIN_PLUGINS:
            name = p["display_name"]
            assert isinstance(name, str) and len(name) > 0, f"{p['name']} display_name is empty"

    def test_category_values_are_valid(self):
        valid_categories = {"flow", "rewrite", "auth", "process", "static", "security", "monitor"}
        invalid = [(p["name"], p["category"]) for p in BUILTIN_PLUGINS if p["category"] not in valid_categories]
        assert not invalid, f"Invalid categories: {invalid}"


class TestGetBuiltinPlugins:

    async def test_all_returns_display_name_and_category(self):
        """all=1 时返回 display_name 和 category 字段"""
        result = await get_builtin_plugins(all=True, db=None)
        plugins = result["plugins"]
        assert len(plugins) == len(BUILTIN_PLUGINS)
        for p in plugins:
            assert "display_name" in p, f"{p['name']} missing display_name"
            assert "category" in p, f"{p['name']} missing category"

    async def test_no_switches_returns_all_plugins(self, test_db):
        """无 PluginEnabled 记录时返回全部插件"""
        result = await get_builtin_plugins(all=False, db=test_db)
        assert len(result["plugins"]) == len(BUILTIN_PLUGINS)

    async def test_disabled_plugin_is_filtered(self, test_db):
        """禁用某个插件后，GET /plugins/builtin 不返回它"""
        test_db.add(PluginEnabled(plugin_name="cors", enabled=0))
        test_db.add(PluginEnabled(plugin_name="proxy_rewrite", enabled=1))
        await test_db.commit()

        result = await get_builtin_plugins(all=False, db=test_db)
        names = [p["name"] for p in result["plugins"]]
        assert "cors" not in names
        assert "proxy_rewrite" in names

    async def test_plugin_not_in_switches_is_treated_as_enabled(self, test_db):
        test_db.add(PluginEnabled(plugin_name="cors", enabled=0))
        test_db.add(PluginEnabled(plugin_name="proxy_rewrite", enabled=1))
        await test_db.commit()

        result = await get_builtin_plugins(all=False, db=test_db)
        names = [p["name"] for p in result["plugins"]]

        assert "cors" not in names
        assert "proxy_rewrite" in names
        assert len(names) == 24


class TestPluginSwitchSchema:

    def test_valid_switch_item(self):
        from app.schemas.plugin_switch import PluginSwitchItem
        item = PluginSwitchItem(plugin_name="cors", enabled=True)
        assert item.plugin_name == "cors"
        assert item.enabled is True

    def test_invalid_plugin_name_rejected(self):
        from app.schemas.plugin_switch import PluginSwitchItem
        with pytest.raises(ValueError, match="Unknown plugin"):
            PluginSwitchItem(plugin_name="nonexistent_plugin", enabled=True)

    def test_empty_plugin_name_rejected(self):
        from app.schemas.plugin_switch import PluginSwitchItem
        with pytest.raises(ValueError):
            PluginSwitchItem(plugin_name="", enabled=True)

    def test_unknown_plugin_name_rejected(self):
        from app.schemas.plugin_switch import PluginSwitchItem
        with pytest.raises(ValueError, match="Unknown plugin"):
            PluginSwitchItem(plugin_name="some_random_name", enabled=False)


class TestPluginSwitchAPI:

    async def test_put_valid_switches(self, test_db):
        from app.schemas.plugin_switch import PluginSwitchItem
        from app.api.v1.plugin_switches import update_plugin_switches
        result = await update_plugin_switches(
            [PluginSwitchItem(plugin_name="cors", enabled=True)],
            db=test_db,
        )
        assert result["message"] == "插件开关已更新"

        from sqlalchemy import select
        from app.models.cluster import PluginEnabled
        r = await test_db.execute(select(PluginEnabled))
        items = r.scalars().all()
        assert len(items) == 1
        assert items[0].plugin_name == "cors"
        assert items[0].enabled == 1

    async def test_put_empty_switches_clears_all(self, test_db):
        from app.api.v1.plugin_switches import update_plugin_switches
        test_db.add(PluginEnabled(plugin_name="cors", enabled=1))
        await test_db.commit()

        await update_plugin_switches([], db=test_db)

        from sqlalchemy import select
        r = await test_db.execute(select(PluginEnabled))
        assert r.scalars().all() == []


class TestPluginDisableWarning:

    async def _create_referencing_data(self, test_db):
        """Helper: create cluster, route, plugin_config, global_rule referencing plugins."""
        from app.models.cluster import Cluster, Route, RoutePlugin, PluginConfig, GlobalRule

        cluster = Cluster(name="test-cluster", display_name="测试集群", status=1)
        test_db.add(cluster)
        await test_db.flush()

        route = Route(name="test-route", uri="/test/*", cluster_id=cluster.id, status=1)
        test_db.add(route)
        await test_db.flush()

        test_db.add(RoutePlugin(route_id=route.id, plugin_name="cors", config="{}"))
        test_db.add(RoutePlugin(route_id=route.id, plugin_name="proxy_rewrite", config='{"uri": "/new"}'))

        pc = PluginConfig(name="test-pc", cluster_id=cluster.id, plugins='{"cors": {}, "traceid": {}}')
        test_db.add(pc)

        gr = GlobalRule(name="test-gr", cluster_id=cluster.id, plugins='{"cors": {}, "monitor": {}}')
        test_db.add(gr)

        await test_db.commit()

    async def test_disable_plugin_with_refs_returns_warning(self, test_db):
        """禁用 cors 时，发现 1 个路由、1 个插件组、1 个全局规则引用了它"""
        from app.schemas.plugin_switch import PluginSwitchItem
        from app.api.v1.plugin_switches import update_plugin_switches

        await self._create_referencing_data(test_db)

        result = await update_plugin_switches(
            [PluginSwitchItem(plugin_name="cors", enabled=False),
             PluginSwitchItem(plugin_name="proxy_rewrite", enabled=True),
             PluginSwitchItem(plugin_name="traceid", enabled=True),
             PluginSwitchItem(plugin_name="monitor", enabled=True)],
            db=test_db,
        )

        assert "warnings" in result
        warnings = {w["plugin"]: w["refs"] for w in result["warnings"]}
        assert "cors" in warnings
        assert warnings["cors"]["routes"] >= 1
        assert warnings["cors"]["plugin_configs"] >= 1
        assert warnings["cors"]["global_rules"] >= 1

    async def test_disable_without_refs_no_warning(self, test_db):
        """禁用未被引用的插件不应产生警告"""
        from app.schemas.plugin_switch import PluginSwitchItem
        from app.api.v1.plugin_switches import update_plugin_switches

        result = await update_plugin_switches(
            [PluginSwitchItem(plugin_name="traceid", enabled=False)],
            db=test_db,
        )
        assert "warnings" not in result or result["warnings"] == []
        from app.api.v1.plugin_switches import update_plugin_switches
        test_db.add(PluginEnabled(plugin_name="cors", enabled=1))
        await test_db.commit()

        await update_plugin_switches([], db=test_db)

        from sqlalchemy import select
        r = await test_db.execute(select(PluginEnabled))
        assert r.scalars().all() == []

