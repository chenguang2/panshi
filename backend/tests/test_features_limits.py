"""features.yaml `limits` 命名空间（static-zip-limit-config）测试。

契约（openspec/changes/static-zip-limit-config/specs/deployment-feature-config）：
- 键 `static_zip_max_mb`：整数 MB，缺省 32，范围 1–2048；
- 未配置 → 校验阶段回写缺省（GET /system/features 恒定透出）；
- 未知键 / bool / 非 int / 越界 → sys.exit(1)；
- 读取走 mtime 热加载，改文件即生效。
"""

import sys
import tempfile
from pathlib import Path

import pytest
import yaml


def _point_features_at(monkeypatch, path: Path) -> None:
    """让 get_features() 读取指定 yaml（含 mtime 热加载缓存重置）。"""
    import app.core.features as fmod

    fmod._features = None
    fmod._features_mtime = 0.0
    monkeypatch.setattr(fmod, "_FEATURES_PATH", path)


class TestLimitsDefaults:
    @pytest.fixture(autouse=True)
    def reset_features(self):
        import app.core.features as fmod

        fmod._features = None
        yield
        fmod._features = None

    def test_missing_limits_namespace_falls_back_to_32(self, tmp_path, monkeypatch):
        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"features": {"tools": True}}), encoding="utf-8")
        _point_features_at(monkeypatch, cfg)

        from app.core.features import get_features, static_zip_max_mb

        assert static_zip_max_mb() == 32
        # 缺省回写：GET /system/features 恒定透出完整键集
        assert get_features()["limits"] == {"static_zip_max_mb": 32}

    def test_missing_key_inside_limits_falls_back_to_32(self, tmp_path, monkeypatch):
        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"limits": {}}), encoding="utf-8")
        _point_features_at(monkeypatch, cfg)

        from app.core.features import static_zip_max_mb

        assert static_zip_max_mb() == 32

    def test_file_not_exists_returns_limits_defaults(self):
        from app.core.features import load_features

        with tempfile.TemporaryDirectory() as d:
            result = load_features(str(Path(d) / "nonexistent.yaml"))
        assert result["limits"] == {"static_zip_max_mb": 32}

    def test_configured_value_is_used(self, tmp_path, monkeypatch):
        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"limits": {"static_zip_max_mb": 64}}), encoding="utf-8")
        _point_features_at(monkeypatch, cfg)

        from app.core.features import static_zip_max_mb

        assert static_zip_max_mb() == 64

    def test_boundaries_accepted(self, tmp_path, monkeypatch):
        import app.core.features as fmod

        for value in (1, 2048):
            cfg = tmp_path / f"features_{value}.yaml"
            cfg.write_text(yaml.dump({"limits": {"static_zip_max_mb": value}}), encoding="utf-8")
            _point_features_at(monkeypatch, cfg)
            assert fmod.static_zip_max_mb() == value


class TestLimitsHotReload:
    @pytest.fixture(autouse=True)
    def reset_features(self):
        import app.core.features as fmod

        fmod._features = None
        yield
        fmod._features = None

    def test_edit_file_takes_effect_without_restart(self, tmp_path, monkeypatch):
        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"limits": {"static_zip_max_mb": 64}}), encoding="utf-8")
        _point_features_at(monkeypatch, cfg)

        from app.core.features import static_zip_max_mb

        assert static_zip_max_mb() == 64
        # 改写文件并推进 mtime
        cfg.write_text(yaml.dump({"limits": {"static_zip_max_mb": 128}}), encoding="utf-8")
        import os
        st = cfg.stat()
        os.utime(cfg, (st.st_atime, st.st_mtime + 5))
        assert static_zip_max_mb() == 128


class TestLimitsValidation:
    @pytest.fixture(autouse=True)
    def reset_features(self):
        import app.core.features as fmod

        fmod._features = None
        yield
        fmod._features = None

    def test_unknown_key_exits_with_allowed_keys(self, tmp_path, monkeypatch, capsys):
        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"limits": {"static_zip_max_gb": 1}}), encoding="utf-8")
        _point_features_at(monkeypatch, cfg)

        from app.core.features import static_zip_max_mb

        with pytest.raises(SystemExit):
            static_zip_max_mb()
        err = capsys.readouterr().err
        assert "static_zip_max_gb" in err
        assert "static_zip_max_mb" in err  # 错误信息列出允许键

    def test_limits_not_mapping_exits(self, tmp_path, monkeypatch):
        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"limits": 32}), encoding="utf-8")
        _point_features_at(monkeypatch, cfg)

        from app.core.features import static_zip_max_mb

        with pytest.raises(SystemExit):
            static_zip_max_mb()

    @pytest.mark.parametrize("bad", [0, -1, 2049, "64", True, 32.5])
    def test_invalid_value_exits(self, tmp_path, monkeypatch, bad):
        cfg = tmp_path / "features.yaml"
        cfg.write_text(yaml.dump({"limits": {"static_zip_max_mb": bad}}), encoding="utf-8")
        _point_features_at(monkeypatch, cfg)

        from app.core.features import static_zip_max_mb

        with pytest.raises(SystemExit):
            static_zip_max_mb()


class TestSystemFeaturesExposesLimits:
    @pytest.fixture(autouse=True)
    def configure(self, tmp_path, monkeypatch):
        import app.core.features as fmod

        cfg = tmp_path / "features.yaml"
        cfg.write_text(
            yaml.dump({"features": {}, "limits": {"static_zip_max_mb": 64}}), encoding="utf-8"
        )
        _point_features_at(monkeypatch, cfg)
        yield

    def test_endpoint_returns_limits(self, isolated_app):
        resp = isolated_app.get("/api/v1/system/features")
        assert resp.status_code == 200
        assert resp.json()["limits"]["static_zip_max_mb"] == 64
