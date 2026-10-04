"""产品事故回归（2026-10-04）：SQLite 默认路径必须锚定 backend 根，与进程 CWD 无关。

目标机以非 backend/ 工作目录启动产品后端 → `./data/panshi.db` 解析到 CWD 下不存在的
目录 → sqlite3.OperationalError: unable to open database file → 应用启动失败。
本文件验证路径常量与 URL 构建的 CWD 无关性（不 monkeypatch 模块常量，读真实缺省值）。
"""

import json
from pathlib import Path

from app.core import db_config
from app.core.db_config import ConnectionConfig, build_engine_url


class TestCwdIndependence:
    def test_default_sqlite_path_anchored_to_backend_root(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        p = Path(db_config.DEFAULT_SQLITE_PATH)
        assert p.is_absolute()
        assert p == Path(db_config.BACKEND_ROOT) / "data" / "panshi.db"

    def test_config_path_anchored_to_backend_root(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        assert Path(db_config.CONFIG_PATH) == Path(db_config.BACKEND_ROOT) / "db_config.json"

    def test_build_engine_url_anchors_relative_sqlite_path(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        conn = ConnectionConfig(id="l", type="sqlite", name="L", path="./data/panshi.db")
        url = build_engine_url(conn)
        expected = "sqlite:///" + (Path(db_config.BACKEND_ROOT) / "data" / "panshi.db").as_posix()
        assert url == expected
        assert "tmp" not in url  # 不随 CWD 漂移

    def test_build_engine_url_absolute_path_passthrough(self, tmp_path):
        target = (tmp_path / "abs.db").as_posix()
        conn = ConnectionConfig(id="l", type="sqlite", name="L", path=target)
        assert build_engine_url(conn) == f"sqlite:///{target}"

    def test_build_engine_url_creates_missing_parent_dir(self, tmp_path):
        target = tmp_path / "a" / "b" / "x.db"
        conn = ConnectionConfig(id="l", type="sqlite", name="L", path=str(target))
        build_engine_url(conn)
        assert target.parent.is_dir()


class TestStoredPathForm:
    """db_config.json 存储形态守卫：默认连接写相对路径（可移植、随目录迁移），
    锚定只发生在解析期（build URL）。

    锚定版修复曾把绝对路径写进自动生成配置——目录迁移后会静默指向旧位置，
    并在那里新建空库（数据"消失"假象）。
    """

    def test_default_config_stores_relative_path(self):
        cfg = db_config.default_config()
        assert cfg.connections[0].path == "./data/panshi.db"

    def test_env_init_stores_relative_sqlite_path(self):
        cfg = db_config.config_from_env("sqlite:///whatever.db")
        assert cfg.connections[0].path == "./data/panshi.db"

    def test_ensure_config_writes_relative_to_disk(self, tmp_path, monkeypatch):
        monkeypatch.setattr(db_config, "CONFIG_PATH", str(tmp_path / "db_config.json"))
        monkeypatch.setattr(db_config, "CONFIG_BAK_PATH", str(tmp_path / "db_config.json.bak"))
        monkeypatch.setattr(
            db_config, "LEGACY_CONFIG_PATH", str(tmp_path / "legacy" / "db_config.json")
        )
        cfg = db_config.ensure_config()
        assert cfg.connections[0].path == "./data/panshi.db"
        raw = json.loads(Path(db_config.CONFIG_PATH).read_text(encoding="utf-8"))
        assert raw["connections"][0]["path"] == "./data/panshi.db"

    def test_default_conn_resolution_still_anchors(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        conn = db_config.default_config().connections[0]
        expected = "sqlite:///" + (Path(db_config.BACKEND_ROOT) / "data" / "panshi.db").as_posix()
        assert db_config.build_engine_url(conn) == expected
