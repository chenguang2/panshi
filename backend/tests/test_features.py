"""Tests for deployment feature configuration (features.yaml)."""

import os
import sys
import tempfile
from pathlib import Path
import pytest
import yaml


def _point_features_at(monkeypatch, path: Path) -> None:
    """让 feature_enabled/get_* 读取指定 yaml（适配 get_features 的 mtime 热重载缓存）。

    背景：555f6fa 引入 mtime 失效机制后，get_features() 会 stat _FEATURES_PATH，
    与缓存 mtime 不符即重载默认路径的真实配置——直接 load_features(临时文件) 的
    旧隔离方式失效，必须 patch _FEATURES_PATH 本身。
    """
    import app.core.features as fmod
    fmod._features = None
    fmod._features_mtime = 0.0
    monkeypatch.setattr(fmod, "_FEATURES_PATH", path)


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

    def test_feature_enabled_default_true(self, tmp_path: Path, monkeypatch):
        """Unknown feature should default to enabled."""
        from app.core.features import feature_enabled

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"features": {}}))
        _point_features_at(monkeypatch, cfg)
        assert feature_enabled("nonexistent_feature") is True

    def test_feature_enabled_known_feature(self, tmp_path: Path, monkeypatch):
        """Known feature should return its configured value."""
        from app.core.features import feature_enabled

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"features": {"tools": False}}))
        _point_features_at(monkeypatch, cfg)
        assert feature_enabled("tools") is False

    # ── get_enabled_plugins ──────────────────────────────

    def test_get_enabled_plugins_empty_by_default(self, tmp_path: Path, monkeypatch):
        """get_enabled_plugins should return empty list when not configured."""
        from app.core.features import get_enabled_plugins

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"features": {}}))
        _point_features_at(monkeypatch, cfg)
        assert get_enabled_plugins() == []

    def test_get_enabled_plugins_returns_list(self, tmp_path: Path, monkeypatch):
        """get_enabled_plugins should return the configured list."""
        from app.core.features import get_enabled_plugins

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "enabled_plugins": ["proxy_rewrite", "cors"],
        }))
        _point_features_at(monkeypatch, cfg)
        assert get_enabled_plugins() == ["proxy_rewrite", "cors"]

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

    # ── known features: recognized + default enabled ─────

    @pytest.mark.parametrize(
        ("feature_name", "default"),
        [
            pytest.param("metrics", True, id="metrics"),
            pytest.param("ssl_cert", True, id="ssl_cert"),
            pytest.param("dns_proxy_udp", True, id="dns_proxy_udp"),
            pytest.param("dns_proxy_http", True, id="dns_proxy_http"),
            pytest.param("task_center", True, id="task_center"),
        ],
    )
    def test_known_feature_recognized_and_default_enabled(
        self, tmp_path: Path, monkeypatch, feature_name: str, default: bool
    ):
        """已知功能名：显式配置 False 被识别（不 SystemExit）；未配置时回落默认值。"""
        from app.core.features import feature_enabled

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"features": {feature_name: False}}))
        _point_features_at(monkeypatch, cfg)
        assert feature_enabled(feature_name) is False

        # 未配置场景：重置缓存强制重读（同秒内两次写入 mtime 可能不变，不能依赖热重载）
        cfg.write_text(yaml.dump({"features": {}}))
        _point_features_at(monkeypatch, cfg)
        assert feature_enabled(feature_name) is default

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

    # ── concurrency: get_concurrency ─────────────────────

    def test_get_concurrency_configured_value(self, tmp_path: Path, monkeypatch):
        """get_concurrency should return the configured value."""
        from app.core.features import get_concurrency

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "concurrency": {"max_playbooks": 10, "batch_action": 7},
        }))
        _point_features_at(monkeypatch, cfg)
        assert get_concurrency("max_playbooks", 5) == 10
        assert get_concurrency("batch_action", 5) == 7

    def test_get_concurrency_default_when_missing(self, tmp_path: Path, monkeypatch):
        """get_concurrency should return default when param not configured."""
        from app.core.features import get_concurrency

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"features": {}}))
        _point_features_at(monkeypatch, cfg)
        assert get_concurrency("max_playbooks", 5) == 5
        assert get_concurrency("batch_action", 5) == 5

    def test_get_concurrency_after_empty_concurrency_mapping(self, tmp_path: Path, monkeypatch):
        """concurrency: {} or null should be treated as empty config."""
        from app.core.features import get_concurrency

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "concurrency": {},
        }))
        _point_features_at(monkeypatch, cfg)
        assert get_concurrency("max_playbooks", 5) == 5

    # ── concurrency: validation errors ───────────────────

    def test_concurrency_not_dict_raises_systemexit(self, tmp_path: Path):
        """concurrency that is not a mapping should cause SystemExit."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "concurrency": "not-a-mapping",
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    def test_concurrency_unknown_key_raises_systemexit(self, tmp_path: Path):
        """Unknown concurrency key (e.g. typo) should cause SystemExit."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "concurrency": {"max_playbook": 5},  # typo!
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    def test_concurrency_boolean_value_raises_systemexit(self, tmp_path: Path):
        """Boolean concurrency value (bool is int subclass) should be rejected."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "concurrency": {"max_playbooks": True},
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    def test_concurrency_zero_raises_systemexit(self, tmp_path: Path):
        """concurrency value 0 should be rejected (must be 1-50)."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "concurrency": {"max_playbooks": 0},
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    def test_concurrency_over_50_raises_systemexit(self, tmp_path: Path):
        """concurrency value > 50 should be rejected."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "concurrency": {"max_playbooks": 51},
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    def test_concurrency_string_value_raises_systemexit(self, tmp_path: Path):
        """String concurrency value should be rejected."""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "concurrency": {"max_playbooks": "5"},
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    # ── mtime hot-reload ─────────────────────────────────

    def test_get_features_reloads_on_file_change(self, tmp_path: Path, monkeypatch):
        """修改 features.yaml 后 get_features 应感知 mtime 变化并重载（555f6fa 热重载守卫）。"""
        import app.core.features as fmod
        from app.core.features import feature_enabled

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"features": {"tools": True}}))
        _point_features_at(monkeypatch, cfg)
        assert feature_enabled("tools") is True

        cfg.write_text(yaml.dump({"features": {"tools": False}}))
        # 确定性触发 mtime 变化（同秒内写入 mtime 可能不变）
        st = cfg.stat()
        os.utime(cfg, (st.st_atime + 10, st.st_mtime + 10))
        assert feature_enabled("tools") is False
