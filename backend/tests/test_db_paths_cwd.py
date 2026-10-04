"""产品事故回归（2026-10-04）：SQLite 默认路径必须锚定 backend 根，与进程 CWD 无关。

目标机以非 backend/ 工作目录启动产品后端 → `./data/panshi.db` 解析到 CWD 下不存在的
目录 → sqlite3.OperationalError: unable to open database file → 应用启动失败。
本文件验证路径常量与 URL 构建的 CWD 无关性（不 monkeypatch 模块常量，读真实缺省值）。
"""

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
