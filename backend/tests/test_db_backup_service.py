"""SQLite 异地备份服务单元测试（tasks 2.1-2.4）。

subprocess（ssh/scp）全部 monkeypatch，不发生真实网络 IO。
"""

import io
import json
import sqlite3
import tarfile
from datetime import datetime
from pathlib import Path

import pytest

from app.core.db_config import ConnectionConfig, DbConfig
from app.services import db_backup_service as svc


def _make_db(path: Path, tables=("sys_user",)):
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    for t in tables:
        conn.execute(f"CREATE TABLE {t} (id INTEGER PRIMARY KEY, name TEXT)")
        conn.execute(f"INSERT INTO {t} (name) VALUES ('n1')")
    conn.commit()
    conn.close()
    return path


class TestSnapshot:
    def test_active_missing_raises(self, tmp_path):
        cfg = DbConfig(
            active="main",
            connections=[ConnectionConfig(id="main", type="sqlite", name="m", path=str(tmp_path / "nope.db"))],
        )
        conns, skipped = svc.collect_sqlite_connections(cfg)
        assert skipped == [] and len(conns) == 1
        with pytest.raises(RuntimeError, match="active"):
            svc.snapshot_sqlite_databases(conns, active_id="main", workdir=str(tmp_path / "w"))

    def test_nonactive_missing_skipped(self, tmp_path):
        good = _make_db(tmp_path / "good.db")
        cfg = DbConfig(
            active="main",
            connections=[
                ConnectionConfig(id="main", type="sqlite", name="m", path=str(good)),
                ConnectionConfig(id="aux", type="sqlite", name="a", path=str(tmp_path / "gone.db")),
                ConnectionConfig(id="pg", type="postgres", name="p", host="x"),
            ],
        )
        conns, skipped = svc.collect_sqlite_connections(cfg)
        assert [c.id for c in conns] == ["main", "aux"]
        assert skipped == ["pg"]
        snapshots, skipped2 = svc.snapshot_sqlite_databases(conns, active_id="main", workdir=str(tmp_path / "w"))
        assert snapshots and snapshots[0]["conn_id"] == "main"
        assert [s["conn_id"] for s in skipped2] == ["aux"]

    def test_vacuum_into_readable(self, tmp_path):
        src = _make_db(tmp_path / "src.db")
        dst = tmp_path / "snap.db"
        svc._vacuum_into(src, dst)
        conn = sqlite3.connect(dst)
        rows = conn.execute("SELECT name FROM sys_user").fetchall()
        conn.close()
        assert rows == [("n1",)]


class TestPackage:
    def _workdir(self, tmp_path):
        w = tmp_path / "w"
        w.mkdir()
        db1 = _make_db(tmp_path / "panshi.db")
        (tmp_path / ".jwt_secret").write_text("secret-key-material")
        return w, db1

    def test_layout_and_meta(self, tmp_path):
        w, db1 = self._workdir(tmp_path)
        snapshots = [{"conn_id": "main", "source": str(db1), "snapshot": str(db1)}]
        meta = {
            "format_version": 1,
            "created_utc": datetime.utcnow().isoformat(),
            "active_connection_id": "main",
            "files": {},
            "databases": {"main": {"original_path": "./data/panshi.db", "archive": "databases/main.db"}},
            "skipped_databases": [],
            "includes": {"static": False, "task_scripts": False, "task_logs": False},
        }
        pkg_path, final_meta = svc.build_package(
            workdir=str(w),
            snapshots=snapshots,
            skipped=[],
            includes={"static": False, "task_scripts": False, "task_logs": False},
            version_info={"app_version": "1.0.0", "git_commit": None},
            meta=meta,
        )
        assert pkg_path.endswith(".tar.gz")
        with tarfile.open(pkg_path, "r:gz") as tf:
            names = tf.getnames()
            assert "meta.json" in names
            assert "config/.jwt_secret" in names
            assert "databases/main.db" in names
            member = tf.extractfile("meta.json")
            m = json.loads(member.read().decode())
        assert m["active_connection_id"] == "main"
        assert m["files"]["databases/main.db"]["size"] == db1.stat().st_size
        assert len(m["files"]["databases/main.db"]["sha256"]) == 64
        assert m["app_version"] == "1.0.0"

    def test_package_name_format(self):
        name = svc._package_name(datetime(2026, 9, 30, 8, 30, 5))
        assert svc.PACKAGE_RE.match(name)
        assert name.startswith("panshi_backup_")


class TestPushAndRetention:
    async def test_push_uses_part_then_mv(self, tmp_path, monkeypatch):
        calls = []

        async def fake_run(cmd, env=None, timeout=None):
            calls.append((list(cmd), env))
            return 0, "", ""

        monkeypatch.setattr(svc, "_run", fake_run)
        local = tmp_path / "pkg.tar.gz"
        local.write_bytes(b"x")
        target = {"host": "h", "port": 22, "username": "u", "auth_type": "password"}
        await svc.push_package(target, str(local), "/remote/dir", "panshi_backup_x.tar.gz", password="pw")
        scp_call = calls[0]
        mv_call = calls[1]
        assert scp_call[0][0] == "sshpass" and scp_call[0][1] == "-e"
        assert scp_call[0][0:2] == ["sshpass", "-e"] or True
        # argv 不含明文密码
        assert "pw" not in scp_call[0] and "pw" not in mv_call[0]
        # 密码经环境变量传递
        assert scp_call[1]["SSHPASS"] == "pw"
        assert "/remote/dir/panshi_backup_x.tar.gz.part" in " ".join(scp_call[0])
        assert "mv" in " ".join(mv_call[0]) and ".part" in " ".join(mv_call[0])

    async def test_retention_cleanup_removes_old_only(self, monkeypatch):
        calls = []

        async def fake_run(cmd, env=None, timeout=None):
            calls.append(list(cmd))
            if cmd[0] in ("ssh", "sshpass"):
                # 第一次是 ls，后续是 rm
                if any("ls -1" in c for c in cmd):
                    return 0, "\n".join(
                        ["panshi_backup_20260930_120000.tar.gz", "panshi_backup_20260929_120000.tar.gz",
                         "panshi_backup_20260928_120000.tar.gz", "unrelated.txt"]
                    ), ""
                return 0, "", ""
            return 0, "", ""

        monkeypatch.setattr(svc, "_run", fake_run)
        target = {"host": "h", "port": 22, "username": "u", "auth_type": "password"}
        removed = await svc.cleanup_retention(target, "/remote/dir", retain_count=2, password="pw")
        # 只删最旧的 1 个，白名单外的文件不动
        assert removed == ["panshi_backup_20260928_120000.tar.gz"]
        rm_calls = [c for c in calls if "rm" in " ".join(c)]
        assert len(rm_calls) == 1
        assert "panshi_backup_20260928_120000.tar.gz" in " ".join(rm_calls[0])
        assert "unrelated.txt" not in " ".join(rm_calls[0])

    async def test_ssh_argv_key_auth(self):
        argv, env = svc._ssh_argv(
            {"host": "h", "port": 2222, "username": "u", "auth_type": "key"}, "ls", password=None,
            key_path="/k/id_ed25519",
        )
        assert argv[0] == "ssh"
        assert "-p" in argv and "2222" in argv
        assert "-i" in argv and "/k/id_ed25519" in argv
        assert "BatchMode=yes" in argv


class TestDataSegmentsAndHygiene:
    def test_include_switches_control_data_segments(self, tmp_path, monkeypatch):
        fake_root = tmp_path / "backend"
        for rel in ["data/static", "data/task-scripts", "data/task-logs"]:
            d = fake_root / rel
            d.mkdir(parents=True)
        (fake_root / "data/static/a.txt").write_text("s")
        (fake_root / "data/task-scripts/s.sh").write_text("#!/bin/sh")
        (fake_root / "data/task-logs/l.log").write_text("log")
        monkeypatch.setattr(svc, "_backend_root", lambda: fake_root)

        db1 = _make_db(tmp_path / "panshi.db")
        (tmp_path / "junk.db").write_bytes(b"not in snapshots")

        def members(includes):
            snaps, _skip = svc.snapshot_sqlite_databases(
                [ConnectionConfig(id="main", type="sqlite", name="m", path=str(db1))], "main", str(tmp_path / "w1")
            )
            w = tmp_path / ("pkg_on" if includes else "pkg_off")
            w.mkdir(exist_ok=True)
            pkg, _meta = svc.build_package(
                workdir=str(w), snapshots=snaps, skipped=[],
                includes=includes, version_info={"app_version": "1", "git_commit": None},
                meta={"active_connection_id": "main", "databases": {}},
            )
            with tarfile.open(pkg) as tf:
                return tf.getnames()

        names_on = members({"static": True, "task_scripts": True, "task_logs": True})
        assert "data/static/a.txt" in names_on
        assert "data/task-scripts/s.sh" in names_on
        assert "data/task-logs/l.log" in names_on
        names_off = members({"static": False, "task_scripts": False, "task_logs": False})
        assert not any(n.startswith("data/") for n in names_off)
        # 垃圾文件（不在快照清单）绝不进包
        assert "junk.db" not in names_on and "databases/junk.db" not in names_on


class TestVersionInfo:
    def test_app_version_info(self):
        info = svc._app_version_info()
        assert set(info) == {"app_version", "git_commit"}
        assert info["app_version"]


class TestPerformBackup:
    async def test_orchestration_and_transaction_discipline(self, tmp_path, monkeypatch):
        """端到端（mock SSH）：历史两段提交、状态回写、外部 IO 期间无未决事务。"""
        from app.core import database as core_db
        from app.core.db_config import ConnectionConfig, DbConfig
        from tests.api_helpers import isolated_app_lifespan

        db1 = _make_db(tmp_path / "panshi.db")
        cfg = DbConfig(
            active="main",
            connections=[ConnectionConfig(id="main", type="sqlite", name="m", path=str(db1))],
        )
        monkeypatch.setattr(svc.db_config, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": None})

        recorded_sessions = []
        real_factory = core_db.AsyncSessionLocal

        class RecordingFactory:
            def __call__(self):
                s = real_factory()
                recorded_sessions.append(s)
                return s

        monkeypatch.setattr(core_db, "AsyncSessionLocal", RecordingFactory())

        async def fake_run(cmd, env=None, timeout=None):
            # 外部 IO 瞬间：此前创建的所有会话都不得持有事务（约定 #29）
            for s in recorded_sessions:
                assert s.in_transaction() is False, "外部 IO 期间不得持有数据库事务"
            return 0, "", ""

        monkeypatch.setattr(svc, "_run", fake_run)

        with isolated_app_lifespan():
            from app.core.database import AsyncSessionLocal
            from app.models.db_backup import DbBackupConfig, DbBackupHistory

            async with AsyncSessionLocal() as s:
                from app.core.db_config import encrypt_password

                await s.merge(DbBackupConfig(
                    id=1, enabled=True, host="h", port=22, username="u", auth_type="password",
                    password_encrypted=encrypt_password("pw"), remote_dir="/remote/dir",
                    interval_minutes=5, retain_count=7,
                ))
                await s.commit()

            result = await svc.perform_backup(trigger="manual")
            assert result["package_name"].startswith("panshi_backup_")

            async with AsyncSessionLocal() as s:
                from sqlalchemy import select

                rows = (
                    await s.execute(
                        select(DbBackupHistory)
                        .where(DbBackupHistory.trigger == "manual")
                        .order_by(DbBackupHistory.id.desc())
                    )
                ).scalars().all()
                assert len(rows) == 1
                assert rows[0].status == "success"
                assert rows[0].trigger == "manual"
                assert rows[0].file_size > 0
                cfg_row = await s.get(DbBackupConfig, 1)
                assert cfg_row.last_status == "success"
                assert cfg_row.last_success_at is not None

    async def test_failure_records_history(self, tmp_path, monkeypatch):
        from app.core.db_config import ConnectionConfig, DbConfig
        from tests.api_helpers import isolated_app_lifespan

        cfg = DbConfig(
            active="main",
            connections=[ConnectionConfig(id="main", type="sqlite", name="m", path=str(tmp_path / "nope.db"))],
        )
        monkeypatch.setattr(svc.db_config, "load_config", lambda: cfg)

        with isolated_app_lifespan():
            from app.core.database import AsyncSessionLocal
            from app.models.db_backup import DbBackupConfig, DbBackupHistory

            async with AsyncSessionLocal() as s:
                from app.core.db_config import encrypt_password

                await s.merge(DbBackupConfig(
                    id=1, enabled=True, host="h", port=22, username="u", auth_type="password",
                    password_encrypted=encrypt_password("pw"), remote_dir="/remote/dir",
                ))
                await s.commit()

            with pytest.raises(RuntimeError, match="active|活动"):
                await svc.perform_backup(trigger="scheduled")

            async with AsyncSessionLocal() as s:
                from sqlalchemy import select

                rows = (await s.execute(
                    select(DbBackupHistory).order_by(DbBackupHistory.id.desc())
                )).scalars().all()
                assert rows and rows[0].status == "failed"
                cfg_row = await s.get(DbBackupConfig, 1)
                assert cfg_row.last_status == "failed"
                assert cfg_row.last_error
