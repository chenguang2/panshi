"""SQLite 异地备份 API 集成测试（调度判定 + 端点权限/审计/互斥）。

使用 async_authed_client（自动登录注入 Authorization）；
mock 一切外部 IO（subprocess / 远端目录）；db_config 注册表 monkeypatch 到临时库。
"""
from datetime import datetime, timedelta

import pytest

from app.core import db_config as dbc
from app.services import db_backup_service as svc

pytestmark = pytest.mark.anyio


def _mkcfg(tmp_path, db_names=("panshi.db",)):
    conns = []
    for n in db_names:
        p = tmp_path / n
        if not p.exists():
            import sqlite3

            con = sqlite3.connect(p)
            con.execute("CREATE TABLE t (x)")
            con.commit()
            con.close()
        conns.append(
            dbc.ConnectionConfig(id=n.split(".")[0], name=n, type="sqlite", path=str(p))
        )
    return dbc.DbConfig(active=conns[0].id, connections=conns)


async def _seed_config_async(**kw):
    from app.core.database import AsyncSessionLocal
    from app.models.db_backup import DbBackupConfig

    async with AsyncSessionLocal() as s:
        row = await s.get(DbBackupConfig, 1)
        if row is None:
            row = DbBackupConfig(id=1)
            s.add(row)
        # 会话级共享测试库存在跨用例数据串扰（约定 #30）：
        # 默认重置调度时间锚点，避免先前用例的 last_success_at 让"到期"判定失效
        for k, v in {"last_run_at": None, "last_success_at": None, **kw}.items():
            setattr(row, k, v)
        await s.commit()


def _fake_remote_ok(monkeypatch, calls):
    async def fake_run(argv, **kw):
        calls.append(argv)
        return 0, "", ""

    monkeypatch.setattr(svc, "_run", fake_run)


class TestBackupEndpoints:
    async def test_get_config_default(self, async_authed_client, monkeypatch, tmp_path):  # noqa: F811
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        r = await async_authed_client.get("/api/v1/db-backup/config")
        assert r.status_code == 200
        body = r.json()
        assert body["config"]["enabled"] is False
        assert body["status"]["applicable"] is True

    async def test_put_config_requires_complete_when_enabled(
        self, async_authed_client, monkeypatch, tmp_path
    ):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        r = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={"enabled": True, "host": None, "username": None, "remote_dir": None},
        )
        assert r.status_code == 422

    async def test_put_config_ok_and_audit(
        self, async_authed_client, monkeypatch, tmp_path
    ):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        r = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={
                "enabled": True,
                "host": "192.0.2.10",
                "port": 22,
                "username": "backup",
                "auth_type": "password",
                "password": "s3cret",
                "remote_dir": "/srv/panshi-dr",
                "interval_minutes": 10,
                "retain_count": 7,
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["config"]["host"] == "192.0.2.10"
        assert body["config"]["has_password"] is True
        assert "password" not in body["config"]  # 无明文回显
        # 审计落库且不含密码（经应用自身的审计查询端点读，避免跨引擎读不到）
        r_audit = await async_authed_client.get("/api/v1/system/operations?page=1&page_size=5")
        assert r_audit.status_code == 200, r_audit.text
        audit_text = r_audit.text
        assert "s3cret" not in audit_text

    async def test_run_manual_backup_flow(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": "t"})
        calls = []
        _fake_remote_ok(monkeypatch, calls)
        # 经 API 种配置（落在与应用一致的隔离库）
        r0 = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={
                "enabled": False,
                "host": "192.0.2.10",
                "port": 22,
                "username": "backup",
                "auth_type": "password",
                "password": "s3cret",
                "remote_dir": "/srv/panshi-dr",
                "interval_minutes": 5,
                "retain_count": 3,
            },
        )
        assert r0.status_code == 200, r0.text
        r = await async_authed_client.post("/api/v1/db-backup/run")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["package_name"].startswith("panshi_backup_")
        assert body["file_size"] > 0
        # 历史落库
        r2 = await async_authed_client.get("/api/v1/db-backup/history")
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert items and items[0]["status"] == "success" and items[0]["trigger"] == "manual"

    async def test_run_rejected_when_inflight(self, async_authed_client, monkeypatch, tmp_path):
        assert svc.try_acquire_inflight()
        try:
            r = await async_authed_client.post("/api/v1/db-backup/run")
            assert r.status_code == 409
        finally:
            svc.release_inflight()

    async def test_history_pagination_shape(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        r = await async_authed_client.get("/api/v1/db-backup/history?page=1&page_size=5")
        assert r.status_code == 200
        assert set(r.json()) == {"total", "page", "page_size", "items"}

    async def test_test_endpoint_uses_body_not_saved(self, async_authed_client, monkeypatch, tmp_path):
        calls = []
        _fake_remote_ok(monkeypatch, calls)
        r = await async_authed_client.post(
            "/api/v1/db-backup/test",
            json={"host": "192.0.2.99", "username": "u1", "password": "pw", "auth_type": "password"},
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True
        argv = " ".join(calls[0])
        assert "192.0.2.99" in argv
        assert "pw" not in argv  # 密码经 SSHPASS 环境变量


class TestSchedulerTick:
    async def test_tick_skips_when_disabled(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        await _seed_config_async(enabled=False)
        assert await svc.scheduler_tick() is False

    async def test_tick_triggers_when_due(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": "t"})
        calls = []
        _fake_remote_ok(monkeypatch, calls)
        # 从未备份过 → 到期
        await _seed_config_async(
            enabled=True,
            host="192.0.2.10",
            username="backup",
            password_encrypted=dbc.encrypt_password("s3cret"),
            remote_dir="/srv/panshi-dr",
        )
        assert await svc.scheduler_tick() is True
        assert calls, "调度到期应触发远端推送"

    async def test_tick_skips_when_not_due(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        await _seed_config_async(
            enabled=True,
            host="h",
            username="u",
            remote_dir="/d",
            last_run_at=datetime.utcnow(),
        )
        assert await svc.scheduler_tick() is False

    async def test_tick_retry_after_full_interval_after_failure(
        self, async_authed_client, monkeypatch, tmp_path
    ):
        """失败后不重试风暴：下一周期（30s tick）不再触发，需等满间隔。"""
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        # 刚失败过（last_run_at = now，last_success_at = None）
        await _seed_config_async(
            enabled=True,
            host="h",
            username="u",
            remote_dir="/d",
            last_run_at=datetime.utcnow(),
            last_success_at=None,
        )
        assert await svc.scheduler_tick() is False
        # 10 分钟前失败 → 到期重试
        await _seed_config_async(last_run_at=datetime.utcnow() - timedelta(minutes=10), interval_minutes=5)
        calls = []
        _fake_remote_ok(monkeypatch, calls)
        assert await svc.scheduler_tick() is True
