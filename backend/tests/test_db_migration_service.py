"""Tests for app.services.db_migration_service — direct streaming migration (B1)."""

import pytest
from sqlalchemy import create_engine, text, select
from sqlalchemy.orm import Session

from app.core.database import Base
from app.models.cluster import Cluster, Upstream, UpstreamTarget, Route
from app.models.user import User
from app.models.system import AuditLog
from app.models.db_migration import DbMigrationLog
from app.core.db_config import ConnectionConfig
from app.services import db_migration_service


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
        session.flush()
        session.add_all([
            UpstreamTarget(id=100, upstream_id=10, target="10.0.0.1:80", weight=100),
            UpstreamTarget(id=101, upstream_id=11, target="10.0.0.2:80", weight=100),
        ])
        session.flush()
        session.add(Route(id=200, edge_uuid="r1", cluster_id=1, upstream_id=10, name="route-1", uri="/a/*"))
        session.add(User(id=300, username="admin", password_hash="hash", role="admin"))
        session.commit()


class TestDirectMigration:
    def test_migrates_all_rows_preserving_ids(self, source_db, target_db):
        _seed(source_db)
        src = ConnectionConfig(id="s", type="sqlite", name="S", path=str(source_db.url).replace("sqlite:///", ""))
        dst = ConnectionConfig(id="t", type="sqlite", name="T", path=str(target_db.url).replace("sqlite:///", ""))

        completed = []
        db_migration_service.migrate_direct(src, dst, progress_cb=lambda done, total: completed.append((done, total)))

        with target_db.connect() as conn:
            clusters = conn.execute(text("SELECT id, name FROM ps_cluster ORDER BY id")).fetchall()
            assert [(c[0], c[1]) for c in clusters] == [(1, "cluster-a"), (2, "cluster-b")]
            ups = conn.execute(text("SELECT id, cluster_id FROM ps_upstream ORDER BY id")).fetchall()
            assert [(u[0], u[1]) for u in ups] == [(10, 1), (11, 2)]
            targets = conn.execute(text("SELECT id, upstream_id FROM ps_upstream_target ORDER BY id")).fetchall()
            assert [(t[0], t[1]) for t in targets] == [(100, 10), (101, 11)]
            routes = conn.execute(text("SELECT id, cluster_id, upstream_id FROM ps_route")).fetchall()
            assert [(r[0], r[1], r[2]) for r in routes] == [(200, 1, 10)]
            users = conn.execute(text("SELECT id, username FROM sys_user")).fetchall()
            assert [(u[0], u[1]) for u in users] == [(300, "admin")]

    def test_sequence_aligned_after_migration(self, source_db, target_db):
        _seed(source_db)
        src = ConnectionConfig(id="s", type="sqlite", name="S", path=str(source_db.url).replace("sqlite:///", ""))
        dst = ConnectionConfig(id="t", type="sqlite", name="T", path=str(target_db.url).replace("sqlite:///", ""))
        db_migration_service.migrate_direct(src, dst)

        with target_db.begin() as conn:
            conn.execute(text("INSERT INTO ps_cluster (id, name, group_name, status) VALUES (99, 'tmp', '', 1)"))
            conn.execute(text("DELETE FROM ps_cluster WHERE id = 99"))
        with target_db.begin() as conn:
            conn.execute(text("INSERT INTO ps_cluster (name, group_name, status) VALUES ('next', '', 1)"))
            row = conn.execute(text("SELECT MAX(id) FROM ps_cluster")).scalar()
        # SQLite INTEGER PRIMARY KEY takes max(id)+1 → next id is 3
        assert row == 3

    def test_progress_callback_reports_all_tables(self, source_db, target_db):
        _seed(source_db)
        src = ConnectionConfig(id="s", type="sqlite", name="S", path=str(source_db.url).replace("sqlite:///", ""))
        dst = ConnectionConfig(id="t", type="sqlite", name="T", path=str(target_db.url).replace("sqlite:///", ""))
        completed = []
        db_migration_service.migrate_direct(src, dst, progress_cb=lambda done, total: completed.append((done, total)))
        assert completed
        final_done, final_total = completed[-1]
        assert final_total == 22
        assert final_done == 22

    def test_source_unmodified(self, source_db, target_db):
        _seed(source_db)
        src = ConnectionConfig(id="s", type="sqlite", name="S", path=str(source_db.url).replace("sqlite:///", ""))
        dst = ConnectionConfig(id="t", type="sqlite", name="T", path=str(target_db.url).replace("sqlite:///", ""))
        before = source_db.connect().execute(text("SELECT COUNT(*) FROM ps_cluster")).scalar()
        db_migration_service.migrate_direct(src, dst)
        after = source_db.connect().execute(text("SELECT COUNT(*) FROM ps_cluster")).scalar()
        assert before == after


class TestReplaceMode:
    def _conn(self, engine):
        return ConnectionConfig(id="c", type="sqlite", name="C", path=str(engine.url).replace("sqlite:///", ""))

    def test_empty_target_no_confirmation_needed(self, source_db, target_db):
        _seed(source_db)
        assert db_migration_service.target_is_empty(self._conn(target_db)) is True
        db_migration_service.migrate_direct(
            self._conn(source_db), self._conn(target_db), mode="replace", confirmed_clear=False,
        )
        with target_db.connect() as c:
            assert c.execute(text("SELECT COUNT(*) FROM ps_cluster")).scalar() == 2

    def test_nonempty_target_requires_confirmation(self, source_db, target_db):
        _seed(source_db)
        with Session(target_db) as s:
            s.add(Cluster(id=500, name="existing"))
            s.commit()
        with pytest.raises(ValueError) as exc:
            db_migration_service.migrate_direct(
                self._conn(source_db), self._conn(target_db), mode="replace", confirmed_clear=False,
            )
        assert "清空" in str(exc.value)
        with target_db.connect() as c:
            assert c.execute(text("SELECT COUNT(*) FROM ps_cluster")).scalar() == 1

    def test_nonempty_target_with_confirmation_clears_then_imports(self, source_db, target_db):
        _seed(source_db)
        with Session(target_db) as s:
            s.add(Cluster(id=500, name="existing"))
            s.commit()
        db_migration_service.migrate_direct(
            self._conn(source_db), self._conn(target_db), mode="replace", confirmed_clear=True,
        )
        with target_db.connect() as c:
            rows = c.execute(text("SELECT id, name FROM ps_cluster ORDER BY id")).fetchall()
            assert [(r[0], r[1]) for r in rows] == [(1, "cluster-a"), (2, "cluster-b")]

    def test_target_is_empty_detection(self, source_db, target_db):
        assert db_migration_service.target_is_empty(self._conn(target_db)) is True
        with Session(target_db) as s:
            s.add(Cluster(id=1, name="x"))
            s.commit()
        assert db_migration_service.target_is_empty(self._conn(target_db)) is False


class TestLogOptionalMigration:
    def _conn(self, engine):
        return ConnectionConfig(id="c", type="sqlite", name="C", path=str(engine.url).replace("sqlite:///", ""))

    def test_exclude_logs_skips_log_tables(self, source_db, target_db):
        _seed(source_db)
        with Session(source_db) as s:
            s.add(AuditLog(id=700, username="admin", action="create", resource="cluster"))
            s.commit()
        db_migration_service.migrate_direct(
            self._conn(source_db), self._conn(target_db), include_logs=False,
        )
        with target_db.connect() as c:
            assert c.execute(text("SELECT COUNT(*) FROM ps_cluster")).scalar() == 2
            assert c.execute(text("SELECT COUNT(*) FROM sys_audit_log")).scalar() == 0

    def test_include_logs_migrates_log_tables(self, source_db, target_db):
        _seed(source_db)
        with Session(source_db) as s:
            s.add(AuditLog(id=700, username="admin", action="create", resource="cluster"))
            s.commit()
        db_migration_service.migrate_direct(
            self._conn(source_db), self._conn(target_db), include_logs=True,
        )
        with target_db.connect() as c:
            assert c.execute(text("SELECT COUNT(*) FROM sys_audit_log")).scalar() == 1


class TestMigrationLog:
    @pytest.mark.asyncio
    async def test_record_migration_log(self, test_db):
        await db_migration_service.record_migration_log(
            test_db,
            direction="sqlite_to_postgres",
            source_connection="local_sqlite",
            target_connection="prod_pg",
            mode="replace",
            status="success",
            include_logs=True,
            tables_count=22,
            backup_path="/data/backups/backup.zip",
        )
        result = await test_db.execute(select(DbMigrationLog))
        row = result.scalar_one()
        assert row.direction == "sqlite_to_postgres"
        assert row.source_connection == "local_sqlite"
        assert row.target_connection == "prod_pg"
        assert row.mode == "replace"
        assert row.status == "success"
        assert row.tables_count == 22
        assert row.backup_path == "/data/backups/backup.zip"

    @pytest.mark.asyncio
    async def test_record_failed_migration_log(self, test_db):
        await db_migration_service.record_migration_log(
            test_db,
            direction="postgres_to_sqlite",
            source_connection="prod_pg",
            target_connection="local_sqlite",
            mode="replace",
            status="failed",
            error_message="connection refused",
        )
        result = await test_db.execute(select(DbMigrationLog))
        row = result.scalar_one()
        assert row.status == "failed"
        assert row.error_message == "connection refused"


class TestDirectionValidation:
    def test_same_source_target_rejected(self):
        with pytest.raises(ValueError) as exc:
            db_migration_service.validate_migration_direction("a", "a", "active")
        assert "相同" in str(exc.value)

    def test_target_is_active_rejected(self):
        with pytest.raises(ValueError) as exc:
            db_migration_service.validate_migration_direction("a", "active", "active")
        assert "当前正在使用" in str(exc.value)

    def test_valid_direction_allowed(self):
        assert db_migration_service.validate_migration_direction("a", "b", "active") is None
