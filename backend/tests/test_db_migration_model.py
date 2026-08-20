"""Tests for app.models.db_migration — ps_db_migration_log model."""

import pytest

from app.models.db_migration import DbMigrationLog


class TestDbMigrationLogModel:
    @pytest.mark.asyncio
    async def test_create_log_persists(self, test_db):
        log = DbMigrationLog(
            direction="sqlite_to_postgres",
            source_connection="local_sqlite",
            target_connection="prod_pg",
            mode="replace",
            status="success",
            include_logs=True,
            tables_count=22,
            backup_path="/data/backups/panshi-backup.zip",
            error_message=None,
        )
        test_db.add(log)
        await test_db.commit()
        await test_db.refresh(log)

        assert log.id is not None
        assert log.direction == "sqlite_to_postgres"
        assert log.source_connection == "local_sqlite"
        assert log.target_connection == "prod_pg"
        assert log.mode == "replace"
        assert log.status == "success"
        assert log.include_logs == 1
        assert log.tables_count == 22
        assert log.backup_path == "/data/backups/panshi-backup.zip"
        assert log.error_message is None
        assert log.created_at is not None

    @pytest.mark.asyncio
    async def test_create_failed_log(self, test_db):
        log = DbMigrationLog(
            direction="postgres_to_sqlite",
            source_connection="prod_pg",
            target_connection="local_sqlite",
            mode="replace",
            status="failed",
            error_message="connection refused",
        )
        test_db.add(log)
        await test_db.commit()
        await test_db.refresh(log)
        assert log.status == "failed"
        assert log.error_message == "connection refused"
