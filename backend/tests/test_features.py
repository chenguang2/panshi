"""Tests for deployment feature configuration (features.yaml)."""

import sys
import tempfile
from pathlib import Path
import pytest
import yaml


class TestFeaturesModule:
    """Unit tests for app.core.features module."""

    @pytest.fixture(autouse=True)
    def reset_features(self):
        """Reset the module-level cache before each test."""
        import app.core.features as fmod
        fmod._features = None
        yield

    # ── File not exists ──────────────────────────────────

    def test_features_not_exists_returns_defaults(self, tmp_path: Path):
        """When features.yaml does not exist, should return default config (all enabled)."""
        from app.core.features import load_features

        nonexistent = tmp_path / "nonexistent.yaml"
        result = load_features(str(nonexistent))

        assert result == {"features": {}, "enabled_plugins": []}

    # ── Valid YAML ───────────────────────────────────────

    def test_valid_yaml_parsed_correctly(self, tmp_path: Path):
        """A valid features.yaml should be parsed correctly."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {"edge_client": False, "tools": True},
            "enabled_plugins": ["proxy_rewrite", "cors"],
        }))

        result = load_features(str(cfg))
        assert result["features"]["edge_client"] is False
        assert result["features"]["tools"] is True
        assert result["enabled_plugins"] == ["proxy_rewrite", "cors"]

    # ── feature_enabled ──────────────────────────────────

    def test_feature_enabled_default_true(self):
        """Unknown feature should default to enabled."""
        from app.core.features import load_features, feature_enabled

        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            f.write(yaml.dump({"features": {}}))
            p = f.name

        try:
            load_features(p)
            assert feature_enabled("nonexistent_feature") is True
        finally:
            Path(p).unlink()

    def test_feature_enabled_known_feature(self):
        """Known feature should return its configured value."""
        from app.core.features import load_features, feature_enabled

        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            f.write(yaml.dump({"features": {"tools": False}}))
            p = f.name

        try:
            load_features(p)
            assert feature_enabled("tools") is False
        finally:
            Path(p).unlink()

    # ── get_enabled_plugins ──────────────────────────────

    def test_get_enabled_plugins_empty_by_default(self):
        """get_enabled_plugins should return empty list when not configured."""
        from app.core.features import load_features, get_enabled_plugins

        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            f.write(yaml.dump({"features": {}}))
            p = f.name

        try:
            load_features(p)
            assert get_enabled_plugins() == []
        finally:
            Path(p).unlink()

    def test_get_enabled_plugins_returns_list(self):
        """get_enabled_plugins should return the configured list."""
        from app.core.features import load_features, get_enabled_plugins

        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            f.write(yaml.dump({
                "features": {},
                "enabled_plugins": ["proxy_rewrite", "cors"],
            }))
            p = f.name

        try:
            load_features(p)
            assert get_enabled_plugins() == ["proxy_rewrite", "cors"]
        finally:
            Path(p).unlink()

    # ── Unknown feature name ─────────────────────────────

    def test_unknown_feature_name_raises_systemexit(self, tmp_path: Path):
        """Unknown feature name in features.yaml should cause SystemExit."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {"edge_clinet": False},  # typo!
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    # ── Wrong value type ─────────────────────────────────

    def test_non_boolean_value_raises_systemexit(self, tmp_path: Path):
        """Non-boolean value for a feature should cause SystemExit."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {"tools": "yes"},  # string, not boolean
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    # ── Malformed YAML ──────────────────────────────────

    def test_malformed_yaml_raises_systemexit(self, tmp_path: Path):
        """Malformed YAML should cause SystemExit."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text("features:\n  edge_client: tru")  # invalid yaml value

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    # ── enabled_plugins not a list ───────────────────────

    def test_enabled_plugins_not_list_raises_systemexit(self, tmp_path: Path):
        """enabled_plugins that is not a list should cause SystemExit."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "enabled_plugins": "proxy_rewrite",  # string, not list
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    # ── Invalid top-level type ───────────────────────────

    def test_non_dict_yaml_raises_systemexit(self, tmp_path: Path):
        """YAML with non-dict top-level should cause SystemExit."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump(["list", "not", "dict"]))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    # ── features not a dict ──────────────────────────────

    def test_features_not_dict_raises_systemexit(self, tmp_path: Path):
        """features field that is not a dict should cause SystemExit."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": ["not", "a", "dict"],
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))
