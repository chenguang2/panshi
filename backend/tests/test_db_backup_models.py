"""SQLite 异地备份：模型与 schema 契约测试（tasks 1.1/1.3）。

设计依据 openspec/changes/sqlite-backup-dr + docs/design/sqlite-backup-dr.md：
- ps_db_backup_config 单行配置表（enabled 默认 False、interval 默认 60、retain 默认 7、
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
            assert row.interval_minutes == 60
            assert row.retain_count == 7
            assert row.include_static is False
            assert row.include_task_scripts is False
            assert row.include_task_logs is False
            assert row.auth_type == "password"
            assert row.port == 22
            assert row.last_run_at is None
            assert row.last_success_at is None
            assert row.last_status is None
            assert row.source_name is None

    async def test_source_name_roundtrip(self, isolated_session):
        """来源标识列可持久化（含点号 / 纯数字均合法值）。"""
        async with isolated_session() as s:
            s.add(DbBackupConfig(id=1, source_name="192.168.0.5"))
            await s.commit()
            row = await s.get(DbBackupConfig, 1)
            assert row.source_name == "192.168.0.5"


class TestSourceNameMigrationRegistration:
    def test_column_registered_in_column_migrations(self):
        """规则 #118：新列漏登记 COLUMN_MIGRATIONS = 存量库启动 crash-loop。"""
        from app.core.migrate import COLUMN_MIGRATIONS

        assert ("ps_db_backup_config", "source_name", "VARCHAR(64)") in COLUMN_MIGRATIONS

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
        """PUT /config 仅全局字段（多目标化后目标字段移至位置 CRUD，载荷忽略）。"""
        from app.schemas.db_backup import DbBackupConfigUpdate

        payload = DbBackupConfigUpdate(
            enabled=True,
            interval_minutes=10,
            include_static=True,
            source_name="edge-node-a",
        )
        assert payload.interval_minutes == 10
        assert payload.include_static is True
        assert payload.source_name == "edge-node-a"

    def test_update_schema_rejects_bad_interval(self):
        from app.schemas.db_backup import DbBackupConfigUpdate

        with pytest.raises(ValidationError):
            DbBackupConfigUpdate(interval_minutes=0)

    def test_update_schema_rejects_bad_auth_type(self):
        """认证方式与密码等连接字段归位置 schema 校验。"""
        from app.schemas.db_backup import DbBackupTargetCreate

        with pytest.raises(ValidationError):
            DbBackupTargetCreate(
                name="t", host="h", username="u", remote_dir="/x", auth_type="token"
            )

    def test_key_auth_without_password(self):
        from app.schemas.db_backup import DbBackupTargetCreate

        payload = DbBackupTargetCreate(
            name="t", host="h", username="u", remote_dir="/x",
            auth_type="key", key_path="/home/backup/.ssh/id_ed25519",
        )
        assert payload.password is None

    def test_source_name_valid_values_accepted(self):
        """合法来源标识：纯 IP / 含点 hostname / 纯数字 / 中划线下划线。"""
        from app.schemas.db_backup import DbBackupConfigUpdate

        for valid in ("192.168.0.5", "edge-host-01.aoh.local", "20260101", "node_a", "a"):
            payload = DbBackupConfigUpdate(host="h", remote_dir="/x", source_name=valid)
            assert payload.source_name == valid

    def test_source_name_empty_and_none_mean_auto(self):
        """空串与 None 等同「未填 → 自动解析」（设计 D6）。"""
        from app.schemas.db_backup import DbBackupConfigUpdate

        assert DbBackupConfigUpdate(host="h", remote_dir="/x").source_name is None
        assert DbBackupConfigUpdate(host="h", remote_dir="/x", source_name="").source_name is None

    @pytest.mark.parametrize(
        "bad",
        [
            "a/b",            # 路径逃逸
            "a b",            # 空白（shell 面）
            "a'b",            # 引号
            "..",             # 首字符非字母数字
            "-x",             # 首字符非字母数字
            ".hidden",        # 首字符非字母数字
            "x" * 65,         # 超长（>64）
        ],
    )
    def test_source_name_illegal_rejected(self, bad):
        from app.schemas.db_backup import DbBackupConfigUpdate

        with pytest.raises(ValidationError):
            DbBackupConfigUpdate(host="h", remote_dir="/x", source_name=bad)

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

    def test_response_includes_source_name(self):
        from app.schemas.db_backup import DbBackupConfigResponse

        resp = DbBackupConfigResponse(
            id=1, enabled=False, port=22, auth_type="password",
            interval_minutes=5, retain_count=7,
            include_static=False, include_task_scripts=False, include_task_logs=False,
            source_name="192.168.0.5",
        )
        assert resp.source_name == "192.168.0.5"

    def test_restore_package_item_source_fields(self):
        """恢复列表条目：source（文件名解析，旧格式 None）+ source_renamed（设计 D5）。"""
        from app.schemas.db_backup import RestorePackageItem

        item = RestorePackageItem(name="panshi_backup_a_20260930_153000.tar.gz", size=10, source="a")
        assert item.source == "a"
        assert item.source_renamed is False
        legacy = RestorePackageItem(name="panshi_backup_20260930_153000.tar.gz", size=10)
        assert legacy.source is None
        assert legacy.source_renamed is False
        renamed = RestorePackageItem(
            name="panshi_backup_a_20260930_153000.tar.gz", size=10, source="a", source_renamed=True
        )
        assert renamed.source_renamed is True


class TestPasswordFernet:
    def test_encrypt_decrypt_roundtrip(self):
        token = db_config.encrypt_password("hunter2")
        assert token != "hunter2"
        assert db_config.decrypt_password(token) == "hunter2"


class TestDbBackupTargetModel:
    """多目标模型（设计 D1/D4）：位置表 name 唯一；子结果表 target_name 快照、target_id 无 FK。"""

    async def test_target_roundtrip_and_unique_name(self, isolated_session):
        from sqlalchemy import select
        from sqlalchemy.exc import IntegrityError

        from app.models.db_backup import DbBackupTarget

        async with isolated_session() as s:
            t = DbBackupTarget(
                name="局内DR", host="192.0.2.10", port=2222, username="backup",
                auth_type="password", password_encrypted="cipher-text",
                key_path=None, remote_dir="/srv/panshi-dr", retain_count=7, enabled=True,
            )
            s.add(t)
            await s.commit()
            await s.refresh(t)
            assert t.id is not None
            assert t.created_at is not None and t.updated_at is not None
        async with isolated_session() as s:
            s.add(DbBackupTarget(name="局内DR", host="h2", username="u", remote_dir="/d"))
            with pytest.raises(IntegrityError):
                await s.commit()
            await s.rollback()

    async def test_history_target_snapshot_and_dangling_target_id(self, isolated_session):
        """target_id=999 不存在也可写入（无 FK 强制，删除位置后悬挂无妨）。"""
        from sqlalchemy import select

        from app.models.db_backup import DbBackupHistory, DbBackupHistoryTarget

        async with isolated_session() as s:
            h = DbBackupHistory(started_at=datetime.utcnow(), status="partial", trigger="manual")
            s.add(h)
            await s.flush()
            s.add(DbBackupHistoryTarget(
                history_id=h.id, target_id=999, target_name="中心机房",
                status="failed", error="连接超时", duration_ms=1234,
            ))
            await s.commit()
            got = (await s.execute(select(DbBackupHistoryTarget))).scalars().first()
            assert got.target_name == "中心机房"
            assert got.target_id == 999
            assert got.status == "failed"

    async def test_config_targets_migrated_default_false(self, isolated_session):
        async with isolated_session() as s:
            row = DbBackupConfig(id=2)
            s.add(row)
            await s.commit()
            await s.refresh(row)
            assert row.targets_migrated is False


class TestTargetsMigratedRegistration:
    def test_column_registered_in_column_migrations(self):
        """规则 #118：新列漏登记 COLUMN_MIGRATIONS = 存量库启动 crash-loop。"""
        from app.core.migrate import COLUMN_MIGRATIONS

        assert ("ps_db_backup_config", "targets_migrated", "BOOLEAN DEFAULT FALSE") in COLUMN_MIGRATIONS


class TestTargetSchemas:
    """位置 CRUD schema 契约（设计 D1：name 校验允许中文、拒文件系统保留字符）。"""

    def _payload(self, **kw):
        from app.schemas.db_backup import DbBackupTargetCreate

        base = {
            "name": "局内DR", "host": "192.0.2.10", "port": 22, "username": "backup",
            "auth_type": "password", "password": "s3cret", "remote_dir": "/srv/dr",
            "retain_count": 7, "enabled": True,
        }
        base.update(kw)
        return DbBackupTargetCreate(**base)

    @pytest.mark.parametrize(
        "name",
        ["局内DR", "default", "中心机房-01", "a b", "x" * 64],
    )
    def test_name_legal_values(self, name):
        assert self._payload(name=name).name == name

    @pytest.mark.parametrize(
        "name",
        [
            "", "   ", " name", "name ", "name\t",
            "a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b",
            "a\nb", "a\x00b", "x" * 65,
        ],
    )
    def test_name_illegal_rejected(self, name):
        from app.schemas.db_backup import DbBackupTargetCreate

        base = {
            "name": name, "host": "h", "username": "u",
            "remote_dir": "/d", "retain_count": 7,
        }
        with pytest.raises(ValidationError):
            DbBackupTargetCreate(**base)

    def test_retain_count_minimum_one(self):
        with pytest.raises(ValidationError):
            self._payload(retain_count=0)

    def test_password_optional_and_empty_normalized(self):
        """密码可省略（留空 = 不修改），空串归一为 None。"""
        assert self._payload(password=None).password is None
        assert self._payload(password="").password is None
        assert self._payload(password="new-pw").password == "new-pw"
