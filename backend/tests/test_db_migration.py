"""Tests for app.core.db_migration — table ordering, state machine, lock."""

import asyncio

import pytest

from app.core import db_migration
from app.core.db_migration import MigrationState, MigrationTask, migration_lock


class TestDependencyOrder:
    def test_contains_22_business_tables(self):
        flat = [t for group in db_migration.DEPENDENCY_ORDER for t in group]
        assert len(flat) == 22

    def test_excludes_migration_log(self):
        flat = set(t for group in db_migration.DEPENDENCY_ORDER for t in group)
        assert "ps_db_migration_log" not in flat

    def test_contains_core_tables(self):
        flat = set(t for group in db_migration.DEPENDENCY_ORDER for t in group)
        for t in ("sys_user", "ps_cluster", "ps_upstream", "ps_route",
                  "ps_ssl_certificate", "install_task", "install_task_node"):
            assert t in flat, t

    def test_all_tables_are_ordered(self):
        flat = [t for group in db_migration.DEPENDENCY_ORDER for t in group]
        # No duplicates
        assert len(flat) == len(set(flat))

    def test_log_tables_identified(self):
        assert "sys_audit_log" in db_migration.LOG_TABLES
        assert "ps_import_log" in db_migration.LOG_TABLES
        assert "install_task" in db_migration.LOG_TABLES
        assert "install_task_node" in db_migration.LOG_TABLES
        assert "ps_cluster" not in db_migration.LOG_TABLES


class TestStateMachine:
    def test_valid_transitions(self):
        t = MigrationTask()
        assert t.state == MigrationState.PENDING
        t.start()
        assert t.state == MigrationState.RUNNING
        t.succeed()
        assert t.state == MigrationState.SUCCESS

    def test_fail_transition(self):
        t = MigrationTask()
        t.start()
        t.fail("boom")
        assert t.state == MigrationState.FAILED
        assert t.error == "boom"

    def test_start_from_success_is_invalid(self):
        t = MigrationTask()
        t.start()
        t.succeed()
        with pytest.raises(ValueError):
            t.start()

    def test_progress_update(self):
        t = MigrationTask()
        t.update_progress(5, 22)
        assert t.completed_tables == 5
        assert t.total_tables == 22


class TestSingleTaskLock:
    def test_lock_acquire_release(self):
        assert migration_lock.acquire()
        assert not migration_lock.acquire()  # already held
        migration_lock.release()
        assert migration_lock.acquire()
        migration_lock.release()

    def test_acquire_blocks_when_held(self):
        assert migration_lock.acquire()
        got = migration_lock.acquire(timeout=0.05)
        assert got is False
        migration_lock.release()
