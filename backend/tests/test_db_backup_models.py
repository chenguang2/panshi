"""SQLite 异地备份：模型与 schema 契约测试（tasks 1.1/1.3）。

设计依据 openspec/changes/sqlite-backup-dr + docs/design/sqlite-backup-dr.md：
- ps_db_backup_config 单行配置表（enabled 默认 False、interval 默认 5、retain 默认 7、
  三开关默认 False、密码 Fernet 加密存 password_encrypted）
- ps_db_backup_history（status running|success|failed、trigger scheduled|manual）
- 时间列一律 naive UTC（约定 #26）
"""

from datetime import datetime

import pytest
from pydantic import ValidationError

from app.core import db_config
from app.models.db_backup import DbBackupConfig, DbBackupHistory


class TestDbBackupConfigModel:
    async def test_defaults(self, isolated_session):
        async with isolated_session() as s:
            row = DbBackupConfig(id=1)
            s.add(row)
            await s.commit()
            await s.refresh(row)
            assert row.enabled is False
            assert row.interval_minutes == 5
            assert row.retain_count == 7
            assert row.include_static is False
            assert row.include_task_scripts is False
            assert row.include_task_logs is False
            assert row.auth_type == "password"
            assert row.port == 22
            assert row.last_run_at is None
            assert row.last_success_at is None
            assert row.last_status is None

    async def test_history_row_roundtrip(self, isolated_session):
        async with isolated_session() as s:
            now = datetime.utcnow()
            row = DbBackupHistory(
                started_at=now,
                finished_at=now,
                status="success",
                trigger="manual",
                package_name="panshi_backup_20260930_120000.tar.gz",
                file_size=1024,
                duration_ms=800,
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            assert row.id is not None
            assert row.status == "success"
            assert row.trigger == "manual"


class TestDbBackupSchemas:
    def test_update_schema_accepts_valid(self):
        from app.schemas.db_backup import DbBackupConfigUpdate

        payload = DbBackupConfigUpdate(
            enabled=True,
            host="192.168.0.13",
            port=22,
            username="backup",
            auth_type="password",
            password="s3cret",
            remote_dir="/work/backup/panshi",
            interval_minutes=10,
            retain_count=3,
            include_static=True,
        )
        assert payload.interval_minutes == 10
        assert payload.password == "s3cret"

    def test_update_schema_rejects_bad_interval(self):
        from app.schemas.db_backup import DbBackupConfigUpdate

        with pytest.raises(ValidationError):
            DbBackupConfigUpdate(host="h", remote_dir="/x", interval_minutes=0)
        with pytest.raises(ValidationError):
            DbBackupConfigUpdate(host="h", remote_dir="/x", retain_count=0)

    def test_update_schema_rejects_bad_auth_type(self):
        from app.schemas.db_backup import DbBackupConfigUpdate

        with pytest.raises(ValidationError):
            DbBackupConfigUpdate(host="h", remote_dir="/x", auth_type="token")

    def test_key_auth_without_password(self):
        from app.schemas.db_backup import DbBackupConfigUpdate

        payload = DbBackupConfigUpdate(
            host="h", remote_dir="/x", auth_type="key", key_path="/home/backup/.ssh/id_ed25519"
        )
        assert payload.password is None

    def test_response_hides_password(self):
        from app.schemas.db_backup import DbBackupConfigResponse

        resp = DbBackupConfigResponse(
            id=1,
            enabled=True,
            host="h",
            port=22,
            username="u",
            auth_type="password",
            key_path=None,
            remote_dir="/x",
            interval_minutes=5,
            retain_count=7,
            include_static=False,
            include_task_scripts=False,
            include_task_logs=False,
            updated_at=datetime.utcnow(),
            has_password=True,
        )
        assert not hasattr(resp, "password")
        assert not hasattr(resp, "password_encrypted")
        assert resp.has_password is True


class TestPasswordFernet:
    def test_encrypt_decrypt_roundtrip(self):
        token = db_config.encrypt_password("hunter2")
        assert token != "hunter2"
        assert db_config.decrypt_password(token) == "hunter2"
