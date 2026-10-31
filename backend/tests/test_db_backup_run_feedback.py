"""立即备份三态反馈（design D2/D8，db-backup-dr-ux-optimization 任务 2.1/2.5）。

- 构建成功但推送全败 → HTTP 200 + status='failed' + 逐位置子结果（不再 409）
- 部分失败 → 200 + status='partial'（既有语义，防回归钉住）
- 已有任务进行中 → 409（唯一保留的 409 语义 = 任务冲突）
- 迁移运行中 → GET /config 的 status.suspended_reason 显式填充；常态为 None
"""
import pytest

from app.core import db_config as dbc
from app.services import db_backup_service as svc

pytestmark = pytest.mark.anyio


def _mkcfg(tmp_path, db_names=("panshi.db",)):
    import sqlite3

    conns = []
    for n in db_names:
        p = tmp_path / n
        if not p.exists():
            con = sqlite3.connect(p)
            con.execute("CREATE TABLE t (x)")
            con.commit()
            con.close()
        conns.append(
            dbc.ConnectionConfig(id=n.split(".")[0], name=n, type="sqlite", path=str(p))
        )
    return dbc.DbConfig(active=conns[0].id, connections=conns)


async def _seed_target(session, name="局内DR", host="192.0.2.10", enabled=True):
    from app.core.db_config import encrypt_password
    from app.models.db_backup import DbBackupTarget

    session.add(
        DbBackupTarget(
            name=name, host=host, port=22, username="backup", auth_type="password",
            password_encrypted=encrypt_password("s3cret"),
            remote_dir="/srv/panshi-dr", retain_count=7, enabled=enabled,
        )
    )
    await session.commit()


def _patch_backup_env(monkeypatch, tmp_path, run_fn=None):
    monkeypatch.setattr(dbc, "load_config", lambda: _mkcfg(tmp_path))
    monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": "t"})
    monkeypatch.setattr(svc, "_detect_source_raw", lambda h, p: "10.0.0.1")
    if run_fn is not None:
        monkeypatch.setattr(svc, "_run", run_fn)


class TestRunThreeState:
    async def test_all_push_failed_returns_200_structured(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path
    ):
        """构建成功、推送全败 → 200 + status='failed' + 逐位置子结果（D2：409 仅任务冲突）。"""

        async def fail_run(argv, env=None, timeout=300):
            return 255, "", "ssh: connect to host 192.0.2.10 port 22: Connection refused"

        _patch_backup_env(monkeypatch, tmp_path, run_fn=fail_run)
        async with isolated_session() as s:
            await _seed_target(s)

        r = await async_authed_client.post("/api/v1/db-backup/run")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "failed"
        # 构建成功：包名在、逐位置子结果为失败态且携带错误
        assert body["package_name"] and body["package_name"].startswith("panshi_backup_")
        assert len(body["targets"]) == 1
        assert body["targets"][0]["status"] == "failed"
        assert "Connection refused" in (body["targets"][0]["error"] or "")
        assert body["error"]  # 汇总错误持久入口

    async def test_partial_failure_returns_200_partial(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path
    ):
        """两个位置一成一败 → 200 + status='partial' + 逐位置子结果。"""

        async def mixed_run(argv, env=None, timeout=300):
            joined = " ".join(argv)
            if "192.0.2.10" in joined:
                return 0, "", ""
            return 255, "", "ssh: connect to host 10.8.0.2 port 22: Connection refused"

        _patch_backup_env(monkeypatch, tmp_path, run_fn=mixed_run)
        async with isolated_session() as s:
            await _seed_target(s, name="局内DR", host="192.0.2.10")
            await _seed_target(s, name="中心机房", host="10.8.0.2")

        r = await async_authed_client.post("/api/v1/db-backup/run")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "partial"
        by_name = {t["target_name"]: t for t in body["targets"]}
        assert by_name["局内DR"]["status"] == "success"
        assert by_name["中心机房"]["status"] == "failed"
        assert "Connection refused" in (by_name["中心机房"]["error"] or "")

    async def test_conflict_still_409(self, async_authed_client, monkeypatch, tmp_path):
        """任务冲突是唯一保留的 409 语义（D2）。"""
        _patch_backup_env(monkeypatch, tmp_path)
        assert svc.try_acquire_inflight()
        try:
            r = await async_authed_client.post("/api/v1/db-backup/run")
            assert r.status_code == 409
            assert "进行中" in r.json()["detail"]
        finally:
            svc.release_inflight()


class TestSuspendedReason:
    async def test_suspended_reason_during_migration(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path
    ):
        """迁移运行中且本应可调度 → status.suspended_reason 显式填充（D8）。"""
        from app.core import maintenance
        from app.models.db_backup import DbBackupConfig

        monkeypatch.setattr(dbc, "load_config", lambda: _mkcfg(tmp_path))
        async with isolated_session() as s:
            s.add(DbBackupConfig(id=1, enabled=True))
            await s.commit()
            await _seed_target(s)

        maintenance.set_migration_in_progress(True)
        try:
            r = await async_authed_client.get("/api/v1/db-backup/config")
            assert r.status_code == 200, r.text
            assert r.json()["status"]["suspended_reason"] == "数据库迁移进行中，定时备份暂停"
        finally:
            maintenance.set_migration_in_progress(False)
        # 复位后常态缺省
        r2 = await async_authed_client.get("/api/v1/db-backup/config")
        assert r2.status_code == 200
        assert r2.json()["status"]["suspended_reason"] is None

    async def test_suspended_reason_absent_when_not_schedulable(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path
    ):
        """不满足「本应可调度」（未启用 / 无启用位置）时即使迁移运行中也不填充。"""
        from app.core import maintenance

        monkeypatch.setattr(dbc, "load_config", lambda: _mkcfg(tmp_path))
        maintenance.set_migration_in_progress(True)
        try:
            # 未启用（无配置行 → enabled=False）
            r = await async_authed_client.get("/api/v1/db-backup/config")
            assert r.status_code == 200, r.text
            assert r.json()["status"]["suspended_reason"] is None
            # 启用但无启用位置（配置行可能已被首次 GET 创建，get-or-create）
            from app.models.db_backup import DbBackupConfig

            async with isolated_session() as s:
                row = await s.get(DbBackupConfig, 1)
                if row is None:
                    row = DbBackupConfig(id=1)
                    s.add(row)
                row.enabled = True
                await s.commit()
            r2 = await async_authed_client.get("/api/v1/db-backup/config")
            assert r2.status_code == 200, r2.text
            assert r2.json()["status"]["suspended_reason"] is None
            assert r2.json()["status"]["reason"] == "未配置启用的备份位置"
        finally:
            maintenance.set_migration_in_progress(False)
