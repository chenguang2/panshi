"""global_rule_plugins 专用清单 key（openspec: global-rule-ux-close-loop，tasks 8.1/8.2/8.4）。

覆盖 specs/deployment-feature-config delta：
- features.yaml 顶层 `global_rule_plugins`（插件名列表）；非列表 → 显式报错退出
  （对齐 enabled_plugins 校验先例，不允许静默降级）；
- 未配置 / 空列表 / 文件不存在 → `get_global_rule_plugins()` 返回 []（不限制）；
- `GET /system/features` 响应含新 key，既有 features / enabled_plugins 字段
  保持不变（只增不改）；
- 仓库默认 features.yaml 发 `global_rule_plugins: [traceid, monitor]`，
  enabled_plugins 现有内容不动。
"""
from pathlib import Path

import pytest
import yaml


def _point_features_at(monkeypatch, path: Path) -> None:
    """让 get_* accessor 读取指定 yaml（同 test_features.py 的 mtime 热重载隔离方式）。"""
    import app.core.features as fmod
    fmod._features = None
    fmod._features_mtime = 0.0
    monkeypatch.setattr(fmod, "_FEATURES_PATH", path)


# ── 类型校验：非列表 → SystemExit ────────────────────────────────────

class TestGlobalRulePluginsValidation:
    def test_non_list_raises_systemexit(self, tmp_path: Path):
        """global_rule_plugins 不是列表 → 显式报错退出（对齐 enabled_plugins 先例）。"""
        from app.core.features import load_features

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "global_rule_plugins": "traceid",  # string, not list
        }))

        with pytest.raises(SystemExit):
            load_features(str(cfg))

    # ── 空 / 未配置 → 不限制（返回 []）─────────────────────────────

    def test_missing_key_accessor_returns_empty(self, tmp_path: Path, monkeypatch):
        """缺 key → []（不限制，目录全量可选）。"""
        from app.core.features import get_global_rule_plugins

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"features": {}}))
        _point_features_at(monkeypatch, cfg)
        assert get_global_rule_plugins() == []

    def test_file_not_exists_accessor_returns_empty(self, tmp_path: Path, monkeypatch):
        """features.yaml 文件不存在 → []（不限制）。"""
        from app.core.features import get_global_rule_plugins

        _point_features_at(monkeypatch, tmp_path / "nonexistent.yaml")
        assert get_global_rule_plugins() == []

    def test_null_value_normalized_to_empty(self, tmp_path: Path, monkeypatch):
        """key 存在但无值（yaml None）→ 归一为 []（enabled_plugins 同款处理）。"""
        from app.core.features import get_global_rule_plugins

        cfg = tmp_path / "features.yaml"
        cfg.write_text("features: {}\nglobal_rule_plugins:\n")
        _point_features_at(monkeypatch, cfg)
        assert get_global_rule_plugins() == []

    def test_empty_list_means_no_restriction(self, tmp_path: Path, monkeypatch):
        """空列表 = 不限制。"""
        from app.core.features import get_global_rule_plugins

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"features": {}, "global_rule_plugins": []}))
        _point_features_at(monkeypatch, cfg)
        assert get_global_rule_plugins() == []

    def test_configured_list_returned(self, tmp_path: Path, monkeypatch):
        """配置了列表 → 原样返回。"""
        from app.core.features import get_global_rule_plugins

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {},
            "global_rule_plugins": ["traceid", "monitor"],
        }))
        _point_features_at(monkeypatch, cfg)
        assert get_global_rule_plugins() == ["traceid", "monitor"]


# ── 配置暴露向后兼容：GET /system/features 只增不改 ─────────────────

class TestSystemFeaturesExposure:
    @pytest.fixture(autouse=True)
    def reset_and_configure(self, tmp_path: Path):
        """经 load_features patch 指向临时配置（同 test_system_features.py 先例）。"""
        import app.core.features as fmod
        fmod._features = None

        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({
            "features": {"tools": True},
            "enabled_plugins": ["proxy_rewrite"],
            "global_rule_plugins": ["traceid", "monitor"],
        }))
        self._orig_load = fmod.load_features
        fmod.load_features = lambda path=None: self._orig_load(str(cfg))  # noqa: ARG005
        yield
        fmod.load_features = self._orig_load
        fmod._features = None

    def test_endpoint_exposes_new_key(self, isolated_app):
        resp = isolated_app.get("/api/v1/system/features")
        assert resp.status_code == 200
        assert resp.json()["global_rule_plugins"] == ["traceid", "monitor"]

    def test_existing_fields_unchanged(self, isolated_app):
        """既有 features / enabled_plugins 字段保持不变（只增不改）。"""
        resp = isolated_app.get("/api/v1/system/features")
        data = resp.json()
        assert data["features"] == {"tools": True}
        assert data["enabled_plugins"] == ["proxy_rewrite"]


# ── 仓库默认配置（8.4）───────────────────────────────────────────────

class TestRepoFeaturesYaml:
    """pytest CWD=backend，直读仓库 backend/features.yaml。"""

    def _load_repo_yaml(self) -> dict:
        return yaml.safe_load(Path("features.yaml").read_text(encoding="utf-8"))

    def test_repo_yaml_ships_default_list(self):
        """默认发 global_rule_plugins: [traceid, monitor]（集群子页现状精确保留）。"""
        cfg = self._load_repo_yaml()
        assert cfg["global_rule_plugins"] == ["traceid", "monitor"]

    def test_repo_yaml_keeps_enabled_plugins_untouched(self):
        """enabled_plugins 现有内容保持不动（不被本变更挪用/删改）。"""
        cfg = self._load_repo_yaml()
        assert cfg["enabled_plugins"] == [
            "proxy_rewrite",
            "response_rewrite",
            "traffic_split",
            "traffic_limit_count",
            "pre_functions",
            "functions_pre",
            "data_center",
            "log_process",
            "static_resource",
            "traceid",
            "monitor",
            "dns_upstream",
            "redirect",
        ]
