"""Tests: static_resource plugin definition carries spa_fallback / app_base schema."""
from app.config.plugin_definitions import BUILTIN_PLUGINS


def _static_resource_plugin():
    return next(p for p in BUILTIN_PLUGINS if p["name"] == "static_resource")


class TestStaticResourcePluginSchema:

    def test_plugin_has_spa_fallback_field(self):
        plugin = _static_resource_plugin()
        assert "spa_fallback" in plugin["schema"]

    def test_spa_fallback_is_boolean_default_true(self):
        field = _static_resource_plugin()["schema"]["spa_fallback"]
        assert field["type"] == "boolean"
        assert field["default"] is True

    def test_spa_fallback_has_description(self):
        field = _static_resource_plugin()["schema"]["spa_fallback"]
        assert "description" in field and field["description"]

    def test_plugin_has_app_base_field(self):
        plugin = _static_resource_plugin()
        assert "app_base" in plugin["schema"]

    def test_app_base_is_string_default_empty(self):
        field = _static_resource_plugin()["schema"]["app_base"]
        assert field["type"] == "string"
        assert field["default"] == ""

    def test_app_base_has_description(self):
        field = _static_resource_plugin()["schema"]["app_base"]
        assert "description" in field and field["description"]

    def test_existing_fields_preserved(self):
        plugin = _static_resource_plugin()
        schema = plugin["schema"]
        assert "cache_max_age" in schema
        assert "index_file" in schema
