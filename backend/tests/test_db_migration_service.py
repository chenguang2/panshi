"""Tests for app.services.db_migration_service — direct streaming migration (B1)."""

import os
import threading

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
from app.services import db_archive_service
from app.services.db_migration_service import MigrationCancelled, MigrationProgressEvent


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
        db_migration_service.migrate_direct(src, dst, progress_cb=lambda done, total, **kw: completed.append((done, total)))

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
        db_migration_service.migrate_direct(src, dst, progress_cb=lambda done, total, **kw: completed.append((done, total)))
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


class TestRowLevelProgressWiring:
    """行级批次进度必须从 _copy_table 真实传到 migrate_direct 的 progress_cb。

    2026-09 核对发现：migrate_direct 曾硬编码 progress_cb=None 调 _copy_table，
    行级进度在真实迁移流中不可见（前端「已迁移 X/Y 行」恒为 0）。
    """

    def _conn(self, engine):
        return ConnectionConfig(id="c", type="sqlite", name="C", path=str(engine.url).replace("sqlite:///", ""))

    def test_migrate_direct_forwards_row_batch_progress(self, source_db, target_db):
        _seed(source_db)
        # 追加 600 行 → 超过 BATCH_SIZE=500，ps_cluster 至少产生 2 个批次回调
        with source_db.begin() as conn:
            for i in range(600):
                conn.execute(
                    text("INSERT INTO ps_cluster (name, group_name, status) VALUES (:n, '', 1)"),
                    {"n": f"bulk-{i}"},
                )

        calls = []
        db_migration_service.migrate_direct(
            self._conn(source_db),
            self._conn(target_db),
            confirmed_clear=True,
            progress_cb=lambda done, total, **kw: calls.append(dict(kw)),
        )

        ps_calls = [c for c in calls if c.get("table_name") == "ps_cluster"]
        assert len(ps_calls) >= 2, "ps_cluster 应产生多个进度回调（每批次一次 + 完成一次）"
        intermediates = [c for c in ps_calls if 0 < (c.get("copied_rows") or 0) < 602]
        assert intermediates, "应存在 copied_rows 未达总数的中间批次回调（行级进度）"
        # 完成回调带 skipped 标记与最终行数
        assert ps_calls[-1]["copied_rows"] == 602
        assert ps_calls[-1]["skipped"] is False


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


class TestMigrationCancelled:
    def test_is_exception(self):
        assert issubclass(MigrationCancelled, Exception)

    def test_can_be_raised_and_caught(self):
        with pytest.raises(MigrationCancelled):
            raise MigrationCancelled("cancelled by user")

    def test_can_be_caught_as_base_exception(self):
        with pytest.raises(Exception):
            raise MigrationCancelled()


class TestMigrationProgressEvent:
    def test_table_start_event(self):
        evt = MigrationProgressEvent(
            type="table_start",
            table_index=1,
            total_tables=22,
            table_name="sys_user",
            total_rows=100,
            copied_rows=0,
            skipped=False,
        )
        assert evt.type == "table_start"
        assert evt.table_index == 1
        assert evt.table_name == "sys_user"
        assert evt.total_rows == 100
        assert evt.skipped is False

    def test_table_progress_event(self):
        evt = MigrationProgressEvent(
            type="table_progress",
            table_index=1,
            total_tables=22,
            table_name="sys_user",
            total_rows=100,
            copied_rows=50,
            skipped=False,
        )
        assert evt.copied_rows == 50

    def test_table_complete_event(self):
        evt = MigrationProgressEvent(
            type="table_complete",
            table_index=1,
            total_tables=22,
            table_name="sys_user",
            total_rows=100,
            copied_rows=100,
            skipped=False,
        )
        assert evt.copied_rows == 100

    def test_skipped_table_event(self):
        evt = MigrationProgressEvent(
            type="table_start",
            table_index=1,
            total_tables=22,
            table_name="sys_user",
            total_rows=0,
            copied_rows=0,
            skipped=True,
        )
        assert evt.skipped is True

    def test_to_dict(self):
        evt = MigrationProgressEvent(
            type="table_start",
            table_index=1,
            total_tables=22,
            table_name="sys_user",
            total_rows=100,
            copied_rows=0,
            skipped=False,
        )
        d = evt.to_dict()
        assert d["type"] == "table_start"
        assert d["table_index"] == 1
        assert d["total_tables"] == 22
        assert d["table_name"] == "sys_user"
        assert d["total_rows"] == 100
        assert d["skipped"] is False


class TestTypeCoercion:
    """任务 1.4/1.5：_coerce_value 跨方言类型协同（db-migration-type-coercion 契约）。"""

    def test_boolean_int_coerced_to_bool(self):
        from sqlalchemy import Boolean as SA_Boolean

        from app.services.db_migration_service import _coerce_value

        assert _coerce_value(1, SA_Boolean()) is True
        assert _coerce_value(0, SA_Boolean()) is False
        assert _coerce_value(True, SA_Boolean()) is True
        assert _coerce_value(None, SA_Boolean()) is None

    def test_datetime_string_coerced_to_datetime(self):
        from datetime import datetime as dt

        from sqlalchemy import DateTime as SA_DateTime

        from app.services.db_migration_service import _coerce_value

        v = _coerce_value("2026-09-08 12:00:00", SA_DateTime())
        assert isinstance(v, dt)
        assert (v.year, v.month, v.day, v.hour, v.minute) == (2026, 9, 8, 12, 0)
        # 非法字符串原样透传，不抛错
        assert _coerce_value("not-a-date", SA_DateTime()) == "not-a-date"

    def test_non_matching_types_pass_through(self):
        from sqlalchemy import String

        from app.services.db_migration_service import _coerce_value

        assert _coerce_value("plain-text", String()) == "plain-text"
        assert _coerce_value(42, String()) == 42


class TestLargeAndEmptyTableMigration:
    """任务 2.4/2.5：大表分批迁移与空表迁移（db-migration-streaming 契约）。"""

    def test_large_table_migrates_in_batches(self, source_db, target_db):
        """1200 行（BATCH_SIZE=500 的 3 个批次）全部迁入，分批回调可见。"""
        with source_db.begin() as conn:
            for i in range(1200):
                conn.execute(
                    text("INSERT INTO ps_cluster (name, group_name, status) VALUES (:n, '', 1)"),
                    {"n": f"bulk-{i}"},
                )
        batches = []
        result = db_migration_service._copy_table(
            source_db, target_db, "ps_cluster", progress_cb=lambda c, t: batches.append((c, t))
        )
        assert result["rows"] == 1200
        assert len(batches) >= 3, "1200 行应产生至少 3 个批次回调"
        assert batches[-1] == (1200, 1200)
        with target_db.connect() as conn:
            assert conn.execute(text("SELECT COUNT(*) FROM ps_cluster")).scalar() == 1200

    def test_empty_table_migrates_without_error(self, source_db, target_db):
        """空表（0 行）迁移不报错：rows=0 且 skipped=False。"""
        result = db_migration_service._copy_table(source_db, target_db, "ps_cluster")
        assert result["skipped"] is False
        assert result["rows"] == 0


class TestCopyTableProgress:
    """Tests for _copy_table with progress callback and COUNT query."""

    def _conn(self, engine):
        return ConnectionConfig(id="c", type="sqlite", name="C", path=str(engine.url).replace("sqlite:///", ""))

    def test_returns_skipped_true_for_missing_source_table(self, source_db, target_db):
        """_copy_table should return skipped=True when source table doesn't exist."""
        result = db_migration_service._copy_table(source_db, target_db, "nonexistent_table")
        assert result["skipped"] is True
        assert result["rows"] == 0

    def test_returns_skipped_false_for_existing_table(self, source_db, target_db):
        """_copy_table should return skipped=False when source table exists."""
        _seed(source_db)
        result = db_migration_service._copy_table(source_db, target_db, "ps_cluster")
        assert result["skipped"] is False
        assert result["rows"] == 2

    def test_columns_count_reports_source_definition(self, source_db, target_db):
        """columns 计数 SHALL 反映源表列定义（db-migration-detail-result 契约）：
        源表含目标缺失的历史列时，报告源列数而非源∩目标交集数。"""
        _seed(source_db)
        # 源库 ps_cluster 带一列当前模型/目标库不存在的历史列（legacy schema 场景）
        with source_db.begin() as conn:
            conn.execute(text("ALTER TABLE ps_cluster ADD COLUMN legacy_note TEXT"))
        result = db_migration_service._copy_table(source_db, target_db, "ps_cluster")
        model_cols = len(Base.metadata.tables["ps_cluster"].columns)
        assert result["columns"] == model_cols + 1, (
            "应报告源表列数（含目标缺失列），而非可插入的交集列数"
        )

    def test_progress_cb_called_with_row_counts(self, source_db, target_db):
        """progress_cb should be called after each batch with (copied_rows, total_rows)."""
        _seed(source_db)
        progress_calls = []

        def on_progress(copied, total):
            progress_calls.append((copied, total))

        db_migration_service._copy_table(source_db, target_db, "ps_cluster", progress_cb=on_progress)
        assert len(progress_calls) >= 1
        # Final call should have all rows copied
        last_copied, last_total = progress_calls[-1]
        assert last_copied == 2
        assert last_total == 2

    def test_total_rows_from_count_query(self, source_db, target_db):
        """total_rows should come from COUNT(*), not from iterating rows."""
        _seed(source_db)
        progress_calls = []

        def on_progress(copied, total):
            progress_calls.append((copied, total))

        db_migration_service._copy_table(source_db, target_db, "ps_cluster", progress_cb=on_progress)
        # First call should have total_rows=2 (from COUNT)
        assert progress_calls[0][1] == 2


class TestMigrateDirectCancel:
    """Tests for migrate_direct with cancel_event cooperative cancellation."""

    def _conn(self, engine):
        return ConnectionConfig(id="c", type="sqlite", name="C", path=str(engine.url).replace("sqlite:///", ""))

    def test_cancel_event_aborts_migration(self, source_db, target_db):
        """Setting cancel_event should raise MigrationCancelled at next table boundary."""
        _seed(source_db)
        cancel_event = threading.Event()
        cancel_event.set()  # Pre-set to cancel immediately

        with pytest.raises(MigrationCancelled):
            db_migration_service.migrate_direct(
                self._conn(source_db),
                self._conn(target_db),
                confirmed_clear=True,
                cancel_event=cancel_event,
            )

    def test_cancel_event_not_set_completes_normally(self, source_db, target_db):
        """When cancel_event is not set, migration completes normally."""
        _seed(source_db)
        cancel_event = threading.Event()  # Not set

        result = db_migration_service.migrate_direct(
            self._conn(source_db),
            self._conn(target_db),
            confirmed_clear=True,
            cancel_event=cancel_event,
        )
        assert len(result) == 22  # All tables migrated

    def test_cancel_event_checked_per_table(self, source_db, target_db):
        """Cancel event should be checked at each table boundary."""
        _seed(source_db)
        cancel_event = threading.Event()

        # Use a progress callback to set cancel_event after first table
        def on_progress(done, total, **kwargs):
            if done >= 1:
                cancel_event.set()

        with pytest.raises(MigrationCancelled):
            db_migration_service.migrate_direct(
                self._conn(source_db),
                self._conn(target_db),
                confirmed_clear=True,
                cancel_event=cancel_event,
                progress_cb=on_progress,
            )

    def test_progress_cb_passes_through_to_copy_table(self, source_db, target_db):
        """progress_cb should be called with table-level progress.

        2026-09 起行级批次回调也透传到外层 progress_cb（见
        TestRowLevelProgressWiring），调用次数可多于表数，但 22 个表序号
        都必须出现，且最终调用为 (22, 22)。
        """
        _seed(source_db)
        progress_calls = []

        def on_progress(done, total, **kwargs):
            progress_calls.append((done, total))

        db_migration_service.migrate_direct(
            self._conn(source_db),
            self._conn(target_db),
            confirmed_clear=True,
            progress_cb=on_progress,
        )
        assert progress_calls[-1] == (22, 22)  # Final call
        assert {d for d, _ in progress_calls} == set(range(1, 23))  # 每张表都有回调


class TestExportArchiveProgress:
    """Tests for export_archive with progress callback."""

    def _conn(self, engine):
        return ConnectionConfig(id="c", type="sqlite", name="C", path=str(engine.url).replace("sqlite:///", ""))

    def test_progress_cb_called_per_table(self, source_db, tmp_path):
        """export_archive should call progress_cb after each table."""
        _seed(source_db)
        progress_calls = []

        def on_progress(done, total, **kwargs):
            progress_calls.append((done, total))

        output_path = str(tmp_path / "test.zip")
        db_archive_service.export_archive(self._conn(source_db), output_path, progress_cb=on_progress)
        assert len(progress_calls) >= 1
        # Last call should have all tables
        assert progress_calls[-1][1] >= 1

    def test_creates_valid_zip(self, source_db, tmp_path):
        """export_archive should still create a valid zip file."""
        _seed(source_db)
        output_path = str(tmp_path / "test.zip")
        db_archive_service.export_archive(self._conn(source_db), output_path)
        assert os.path.exists(output_path)
        assert os.path.getsize(output_path) > 0
