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
