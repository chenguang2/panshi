"""Tests for app.core.db_config — connection config management."""

import json
import os
import stat

import pytest

from app.core import db_config
from app.core.db_config import (
    ConnectionConfig,
    DbConfig,
    build_engine_url,
    decrypt_password,
    encrypt_password,
    load_config,
    save_config,
)


@pytest.fixture(autouse=True)
def _reset_module(tmp_path, monkeypatch):
    """Point config paths at a temp dir and reset module cache between tests."""
    monkeypatch.setattr(db_config, "CONFIG_PATH", str(tmp_path / "db_config.json"))
    monkeypatch.setattr(db_config, "CONFIG_BAK_PATH", str(tmp_path / "db_config.json.bak"))
    yield


def _write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


class TestPasswordEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        secret = "S3cret!"
        encrypted = encrypt_password(secret)
        assert encrypted != secret
        assert decrypt_password(encrypted) == secret

    def test_encrypt_deterministic_key_from_jwt_secret(self, monkeypatch):
        monkeypatch.setenv("JWT_SECRET_KEY", "test-jwt-secret")
        # Two calls with same key produce decryptable, different ciphertexts
        e1 = encrypt_password("pw")
        e2 = encrypt_password("pw")
        assert decrypt_password(e1) == "pw"
        assert decrypt_password(e2) == "pw"
        assert e1 != e2  # Fernet random IV


class TestConfigFileRoundTrip:
    def test_save_then_load_roundtrip(self, tmp_path):
        cfg = DbConfig(
            version=1,
            active="local",
            connections=[
                ConnectionConfig(
                    id="local", type="sqlite", name="本地 SQLite", path="./data/panshi.db"
                ),
                ConnectionConfig(
                    id="pg",
                    type="postgres",
                    name="生产 PG",
                    host="192.168.1.10",
                    port=5432,
                    database="panshi",
                    username="panshi",
                    password_enc=encrypt_password("secret"),
                ),
            ],
        )
        save_config(cfg, path=str(tmp_path / "db_config.json"))
        loaded = load_config(path=str(tmp_path / "db_config.json"))
        assert loaded.version == 1
        assert loaded.active == "local"
        assert len(loaded.connections) == 2
        assert loaded.connections[1].id == "pg"
        assert decrypt_password(loaded.connections[1].password_enc) == "secret"

    def test_config_file_permissions_600(self, tmp_path):
        cfg = DbConfig(version=1, active="local", connections=[])
        path = str(tmp_path / "db_config.json")
        save_config(cfg, path=path)
        mode = stat.S_IMODE(os.stat(path).st_mode)
        assert mode & 0o777 == 0o600

    def test_password_masked_in_public_view(self):
        conn = ConnectionConfig(
            id="pg", type="postgres", name="PG", host="h", database="d",
            username="u", password_enc=encrypt_password("secret"),
        )
        view = conn.public_dict()
        assert "password_enc" not in view
        assert "password" not in view
        assert view["password_set"] is True

    def test_password_not_set_flag(self):
        conn = ConnectionConfig(id="local", type="sqlite", name="L", path="./x.db")
        assert conn.public_dict()["password_set"] is False


class TestCorruptionFallback:
    def test_corrupt_config_falls_back_to_bak(self, tmp_path):
        # valid bak, corrupt main
        cfg = DbConfig(version=1, active="pg", connections=[
            ConnectionConfig(id="pg", type="postgres", name="PG", host="h", database="d", username="u"),
        ])
        save_config(cfg, path=str(tmp_path / "db_config.json.bak"))
        _write(tmp_path / "db_config.json", "{not valid json")

        loaded = load_config(path=str(tmp_path / "db_config.json"))
        assert loaded.active == "pg"
        assert loaded.connections[0].id == "pg"

    def test_corrupt_config_no_bak_falls_back_default_sqlite(self, tmp_path):
        _write(tmp_path / "db_config.json", "{also not valid")
        loaded = load_config(path=str(tmp_path / "db_config.json"))
        # Default config: active local sqlite
        assert loaded.active == "local_sqlite"
        assert loaded.connections[0].type == "sqlite"

    def test_missing_config_returns_default(self, tmp_path):
        loaded = load_config(path=str(tmp_path / "nonexistent.json"))
        assert loaded.active == "local_sqlite"
        assert loaded.connections[0].type == "sqlite"


class TestEnvVarCompatInit:
    def test_init_from_env_when_no_file(self, tmp_path, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host:5433/dbname")
        path = str(tmp_path / "db_config.json")
        cfg = db_config.ensure_config(path=path)
        assert cfg.active == "env_pg"
        pg = cfg.connections[0]
        assert pg.type == "postgres"
        assert pg.host == "host"
        assert pg.port == 5433
        assert pg.database == "dbname"
        assert pg.username == "u"
        assert decrypt_password(pg.password_enc) == "p"
        # file now written
        assert os.path.exists(path)

    def test_existing_file_wins_over_env(self, tmp_path, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/dbname")
        cfg = DbConfig(version=1, active="local", connections=[
            ConnectionConfig(id="local", type="sqlite", name="L", path="./x.db"),
        ])
        path = str(tmp_path / "db_config.json")
        save_config(cfg, path=path)
        loaded = db_config.ensure_config(path=path)
        assert loaded.active == "local"
        assert loaded.connections[0].id == "local"


class TestBuildEngineUrl:
    def test_sqlite_url(self):
        conn = ConnectionConfig(id="l", type="sqlite", name="L", path="./data/panshi.db")
        assert build_engine_url(conn) == "sqlite:///./data/panshi.db"

    def test_postgres_url(self):
        conn = ConnectionConfig(
            id="pg", type="postgres", name="PG", host="192.168.1.10",
            port=5432, database="panshi", username="panshi",
            password_enc=encrypt_password("secret"),
        )
        url = build_engine_url(conn)
        assert url.startswith("postgresql://panshi:secret@192.168.1.10:5432/panshi")

    def test_postgres_url_default_port(self):
        conn = ConnectionConfig(
            id="pg", type="postgres", name="PG", host="h",
            database="d", username="u", password_enc=encrypt_password("p"),
        )
        assert "h:5432/d" in build_engine_url(conn)
