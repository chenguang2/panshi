"""Tests for app.services.db_archive_service — B2 archive export/import."""

import json
import os
import zipfile

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.database import Base
from app.models.cluster import Cluster, Upstream, UpstreamTarget
from app.core.db_config import ConnectionConfig
from app.services import db_archive_service


@pytest.fixture()
def source_db(tmp_path):
    path = str(tmp_path / "source.db")
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def target_db(tmp_path):
    path = str(tmp_path / "target.db")
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


def _seed(engine):
    with Session(engine) as session:
        session.add_all([
            Cluster(id=1, name="cluster-a"),
            Cluster(id=2, name="cluster-b"),
        ])
        session.flush()
        session.add_all([
            Upstream(id=10, edge_uuid="u1", cluster_id=1, name="up-1"),
            Upstream(id=11, edge_uuid="u2", cluster_id=2, name="up-2"),
        ])
        session.commit()


def _conn(engine):
    return ConnectionConfig(id="c", type="sqlite", name="C", path=str(engine.url).replace("sqlite:///", ""))


class TestArchiveExport:
    def test_export_creates_zip_with_expected_entries(self, source_db, tmp_path):
        _seed(source_db)
        out = str(tmp_path / "backup.zip")
        db_archive_service.export_archive(_conn(source_db), out)
        assert os.path.exists(out)
        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            assert "meta.json" in names
            assert "schema.json" in names
            assert "data/ps_cluster.jsonl" in names
            meta = json.loads(z.read("meta.json"))
            assert meta["tables"]["ps_cluster"] == 2
            assert meta["tables"]["ps_upstream"] == 2
            lines = z.read("data/ps_cluster.jsonl").decode().strip().split("\n")
            assert len(lines) == 2

    def test_export_jsonl_contains_ids(self, source_db, tmp_path):
        _seed(source_db)
        out = str(tmp_path / "backup.zip")
        db_archive_service.export_archive(_conn(source_db), out)
        with zipfile.ZipFile(out) as z:
            rows = [json.loads(l) for l in z.read("data/ps_cluster.jsonl").decode().strip().split("\n")]
            ids = sorted(r["id"] for r in rows)
            assert ids == [1, 2]
            names = sorted(r["name"] for r in rows)
            assert names == ["cluster-a", "cluster-b"]


class TestArchiveImport:
    def test_roundtrip_import_restores_data(self, source_db, target_db, tmp_path):
        _seed(source_db)
        out = str(tmp_path / "backup.zip")
        db_archive_service.export_archive(_conn(source_db), out)
        db_archive_service.import_archive(out, _conn(target_db), confirmed_clear=False)
        with target_db.connect() as c:
            clusters = c.execute(text("SELECT id, name FROM ps_cluster ORDER BY id")).fetchall()
            assert [(r[0], r[1]) for r in clusters] == [(1, "cluster-a"), (2, "cluster-b")]
            ups = c.execute(text("SELECT id, cluster_id FROM ps_upstream ORDER BY id")).fetchall()
            assert [(u[0], u[1]) for u in ups] == [(10, 1), (11, 2)]

    def test_import_to_nonempty_requires_confirmation(self, source_db, target_db, tmp_path):
        _seed(source_db)
        out = str(tmp_path / "backup.zip")
        db_archive_service.export_archive(_conn(source_db), out)
        with Session(target_db) as s:
            s.add(Cluster(id=500, name="existing"))
            s.commit()
        with pytest.raises(ValueError) as exc:
            db_archive_service.import_archive(out, _conn(target_db), confirmed_clear=False)
        assert "清空" in str(exc.value)

    def test_import_to_nonempty_with_confirmation_clears(self, source_db, target_db, tmp_path):
        _seed(source_db)
        out = str(tmp_path / "backup.zip")
        db_archive_service.export_archive(_conn(source_db), out)
        with Session(target_db) as s:
            s.add(Cluster(id=500, name="existing"))
            s.commit()
        db_archive_service.import_archive(out, _conn(target_db), confirmed_clear=True)
        with target_db.connect() as c:
            rows = c.execute(text("SELECT id FROM ps_cluster ORDER BY id")).fetchall()
            assert [r[0] for r in rows] == [1, 2]

    def test_missing_archive_rejected(self, target_db, tmp_path):
        with pytest.raises(ValueError):
            db_archive_service.import_archive(str(tmp_path / "missing.zip"), _conn(target_db), confirmed_clear=False)


class TestGetDdlDialectGate:
    """_get_ddl 只对 SQLite 执行 sqlite_master 查询（PG 源库导出回归）。

    背景：export_archive 曾无条件执行 SQLite 专有的 sqlite_master 查询，
    PG 源库导出在第一张表即报 UndefinedTable（relation "sqlite_master" does not exist）。
    """

    def test_get_ddl_skips_non_sqlite_dialect(self):
        pg_engine = create_engine("postgresql+psycopg2://user:pass@127.0.0.1:1/db")

        class _NoQueryConn:
            def execute(self, *args, **kwargs):
                raise AssertionError("sqlite_master SQL must not run on non-SQLite dialects")

        assert db_archive_service._get_ddl(pg_engine, _NoQueryConn(), "sys_user") == ""
        pg_engine.dispose()

    def test_get_ddl_returns_ddl_for_sqlite(self, source_db):
        Base.metadata.create_all(source_db)
        with source_db.connect() as conn:
            ddl = db_archive_service._get_ddl(source_db, conn, "ps_cluster")
        assert "CREATE TABLE" in ddl
        assert "ps_cluster" in ddl


class TestSerializeRow:
    """PG 源库经 psycopg2 返回 datetime/Decimal 对象，行序列化不得崩溃。"""

    def test_serialize_row_handles_datetime(self):
        from datetime import datetime

        payload = db_archive_service._serialize_row(
            {"id": 1, "created_at": datetime(2026, 1, 2, 3, 4, 5)}
        )
        assert json.loads(payload) == {"id": 1, "created_at": "2026-01-02 03:04:05"}

    def test_serialize_row_handles_decimal(self):
        from decimal import Decimal

        payload = db_archive_service._serialize_row({"id": 1, "ratio": Decimal("1.5")})
        assert json.loads(payload) == {"id": 1, "ratio": "1.5"}


@pytest.mark.skipif(not os.getenv("PG_DSN"), reason="PG_DSN not set; skipping PG export test")
class TestPostgresSourceExport:
    """真 PG 源库导出回归（需 PG_DSN，opt-in；对源库只读）。"""

    def test_export_from_pg_succeeds(self, tmp_path):
        from app.core.database import build_sync_engine_for
        from app.core.db_config import encrypt_password

        dsn = os.getenv("PG_DSN")
        assert dsn, "PG_DSN must be set"
        host, port, dbname = _parse_pg_dsn(dsn)
        conn = ConnectionConfig(
            id="pg_src", type="postgresql", name="PG", host=host, port=port,
            database=dbname, username="postgres",
            password_enc=encrypt_password("postgres"),
        )
        out = str(tmp_path / "pg_backup.zip")
        db_archive_service.export_archive(conn, out)
        with zipfile.ZipFile(out) as z:
            assert "meta.json" in z.namelist()
            assert "data/ps_cluster.jsonl" in z.namelist()
            # ddl/ 是 best-effort：非 SQLite 源允许为空，但导出必须完整成功
            tables = json.loads(z.read("meta.json"))["tables"]
            assert isinstance(tables, dict)
        build_sync_engine_for(conn).dispose()


def _parse_pg_dsn(dsn: str) -> tuple[str, int, str]:
    from urllib.parse import urlparse

    parsed = urlparse(dsn)
    return parsed.hostname or "localhost", parsed.port or 5432, (parsed.path or "/").lstrip("/")
