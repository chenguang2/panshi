"""Tests for app.core.database — config-driven engine creation."""

import pytest
from sqlalchemy import text

from app.core import database, db_config
from app.core.db_config import ConnectionConfig, DbConfig, encrypt_password


@pytest.fixture(autouse=True)
def _isolate_config(tmp_path, monkeypatch):
    """Point config at temp dir and ensure an active SQLite connection exists."""
    monkeypatch.setattr(db_config, "CONFIG_PATH", str(tmp_path / "db_config.json"))
    monkeypatch.setattr(db_config, "CONFIG_BAK_PATH", str(tmp_path / "db_config.json.bak"))
    monkeypatch.setattr(db_config, "DEFAULT_SQLITE_PATH", str(tmp_path / "panshi.db"))
    monkeypatch.setattr(database, "CONFIG_PATH", str(tmp_path / "db_config.json"))
    monkeypatch.setattr(database, "CONFIG_BAK_PATH", str(tmp_path / "db_config.json.bak"))
    # ensure_config seeds a default SQLite config on first call
    yield


def _save_config(tmp_path, cfg):
    db_config.save_config(cfg, path=str(tmp_path / "db_config.json"))


class TestActiveConnection:
    def test_returns_active_sqlite(self, tmp_path):
        _save_config(tmp_path, DbConfig(version=1, active="local", connections=[
            ConnectionConfig(id="local", type="sqlite", name="L", path="./data/x.db"),
            ConnectionConfig(id="pg", type="postgres", name="P", host="h", database="d",
                             username="u", password_enc=encrypt_password("p")),
        ]))
        conn = database.get_active_connection()
        assert conn.id == "local"
        assert conn.type == "sqlite"

    def test_returns_active_postgres(self, tmp_path):
        _save_config(tmp_path, DbConfig(version=1, active="pg", connections=[
            ConnectionConfig(id="local", type="sqlite", name="L", path="./data/x.db"),
            ConnectionConfig(id="pg", type="postgres", name="P", host="h", database="d",
                             username="u", password_enc=encrypt_password("p")),
        ]))
        assert database.get_active_connection().id == "pg"


class TestIsSqlitePreserved:
    def test_is_sqlite_true(self):
        assert database.is_sqlite("sqlite:///x.db") is True
        assert database.is_sqlite("sqlite+aiosqlite:///x.db") is True

    def test_is_sqlite_false_for_pg(self):
        assert database.is_sqlite("postgresql://u:p@h/db") is False
        assert database.is_sqlite("postgresql+asyncpg://u:p@h/db") is False


class TestEngineBuilders:
    def test_sync_engine_points_at_active_sqlite(self, tmp_path):
        _save_config(tmp_path, DbConfig(version=1, active="local", connections=[
            ConnectionConfig(id="local", type="sqlite", name="L", path=str(tmp_path / "mydb.db")),
        ]))
        engine = database.create_sync_engine()
        with engine.connect() as conn:
            conn.execute(text("CREATE TABLE t (id INTEGER PRIMARY KEY)"))
            conn.commit()
        # file created at active path
        assert (tmp_path / "mydb.db").exists()

    def test_build_sync_engine_for_arbitrary_connection(self, tmp_path):
        conn = ConnectionConfig(id="c", type="sqlite", name="C", path=str(tmp_path / "arb.db"))
        engine = database.build_sync_engine_for(conn)
        with engine.connect() as cc:
            cc.execute(text("CREATE TABLE x (id INTEGER PRIMARY KEY)"))
            cc.commit()
        assert (tmp_path / "arb.db").exists()

    def test_build_async_engine_for_sqlite(self, tmp_path):
        conn = ConnectionConfig(id="c", type="sqlite", name="C", path=str(tmp_path / "a.db"))
        engine = database.build_async_engine_for(conn)
        assert "aiosqlite" in str(engine.url)

    def test_build_async_engine_for_postgres(self):
        conn = ConnectionConfig(id="c", type="postgres", name="C", host="h", database="d",
                                username="u", password_enc=encrypt_password("p"))
        engine = database.build_async_engine_for(conn)
        assert "asyncpg" in str(engine.url)
