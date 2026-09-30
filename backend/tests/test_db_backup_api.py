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


async def _seed_target_async(name="t1", host="192.0.2.10", enabled=True, retain_count=7):
    """全局（AsyncSessionLocal 世界）位置行种子：跨用例清理后重建，保证调度判定确定性。"""
    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.core.db_config import encrypt_password
    from app.models.db_backup import DbBackupTarget

    async with AsyncSessionLocal() as s:
        for t in (await s.execute(select(DbBackupTarget))).scalars().all():
            await s.delete(t)
        # 显式冲刷删除（SQLAlchemy 同表 INSERT 先于 DELETE 冲刷，同名重插会撞唯一约束）
        await s.flush()
        s.add(DbBackupTarget(
            name=name, host=host, port=22, username="backup", auth_type="password",
            password_encrypted=encrypt_password("s3cret"),
            remote_dir="/srv/panshi-dr", retain_count=retain_count, enabled=enabled,
        ))
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

    async def test_put_config_enabled_without_targets_ok(
        self, async_authed_client, monkeypatch, tmp_path
    ):
        """多目标语义：启用不再要求目标字段完整（无启用位置仅表现为「不适用」）。"""
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_detect_source_raw", lambda h, p: "10.0.0.1")
        r = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={"enabled": True, "interval_minutes": 10},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["config"]["enabled"] is True
        assert body["status"]["reason"] == "未配置启用的备份位置"

    async def test_put_config_ok_and_audit(
        self, async_authed_client, monkeypatch, tmp_path
    ):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        # 全局字段走 PUT；连接字段（含密码）走位置 CRUD
        r = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={"enabled": True, "interval_minutes": 10},
        )
        assert r.status_code == 200, r.text
        rt = await async_authed_client.post("/api/v1/db-backup/targets", json={
            "name": "局内DR", "host": "192.0.2.10", "username": "backup",
            "password": "s3cret", "remote_dir": "/srv/panshi-dr", "retain_count": 7,
        })
        assert rt.status_code == 200, rt.text
        assert rt.json()["has_password"] is True
        assert "password" not in rt.json()  # 无明文回显
        # 审计落库且不含密码（经应用自身的审计查询端点读，避免跨引擎读不到）
        r_audit = await async_authed_client.get("/api/v1/system/operations?page=1&page_size=5")
        assert r_audit.status_code == 200, r_audit.text
        audit_text = r_audit.text
        assert "s3cret" not in audit_text

    async def test_put_config_empty_source_auto_resolves(
        self, async_authed_client, monkeypatch, tmp_path
    ):
        """载荷空 → 自动解析并持久化，响应回显（spec：来源标识空值自动解析）。"""
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_detect_source_raw", lambda host, port: "192.0.2.7")
        r = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={
                "enabled": False,
                "host": "192.0.2.10",
                "port": 22,
                "username": "backup",
                "auth_type": "password",
                "password": "s3cret",
                "remote_dir": "/srv/panshi-dr",
                "source_name": "",
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["config"]["source_name"] == "192.0.2.7"
        # 已持久化（GET 再读仍在）
        r2 = await async_authed_client.get("/api/v1/db-backup/config")
        assert r2.json()["config"]["source_name"] == "192.0.2.7"

    async def test_put_config_explicit_source_saved(
        self, async_authed_client, monkeypatch, tmp_path
    ):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        probes = []
        monkeypatch.setattr(svc, "_detect_source_raw", lambda h, p: probes.append(1) or "10.0.0.1")
        r = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={
                "enabled": False,
                "host": "192.0.2.10",
                "username": "backup",
                "remote_dir": "/srv/panshi-dr",
                "source_name": "edge-node-a",
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["config"]["source_name"] == "edge-node-a"
        assert probes == []  # 显式提供时不探测

    async def test_put_config_rejects_illegal_source(
        self, async_authed_client, monkeypatch, tmp_path
    ):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        r = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={
                "enabled": False,
                "host": "192.0.2.10",
                "username": "backup",
                "remote_dir": "/srv/panshi-dr",
                "source_name": "bad/name",
            },
        )
        assert r.status_code == 422
        r2 = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={
                "enabled": False,
                "host": "192.0.2.10",
                "username": "backup",
                "remote_dir": "/srv/panshi-dr",
                "source_name": "-leading-dash",
            },
        )
        assert r2.status_code == 422

    async def test_run_backup_resolves_null_source_then_sticks(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path
    ):
        """存量 NULL 首次备份解析回写；后续备份不再动态探测（spec：存量空值首次备份回写）。"""
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": "t"})
        calls = []
        _fake_remote_ok(monkeypatch, calls)
        probes = []

        def probe(host, port):
            probes.append((host, port))
            return "10.0.0.9"

        monkeypatch.setattr(svc, "_detect_source_raw", probe)
        # 经应用的隔离库直接种「存量升级遗留」配置行（source_name 为 NULL）+ 启用位置
        from app.models.db_backup import DbBackupConfig, DbBackupTarget

        async with isolated_session() as s:
            s.add(DbBackupConfig(id=1, enabled=False, source_name=None))
            s.add(DbBackupTarget(
                name="局内DR", host="192.0.2.10", port=22, username="backup",
                auth_type="password", password_encrypted=dbc.encrypt_password("s3cret"),
                remote_dir="/srv/panshi-dr", retain_count=7, enabled=True,
            ))
            await s.commit()
        r = await async_authed_client.post("/api/v1/db-backup/run")
        assert r.status_code == 200, r.text
        assert "panshi_backup_10.0.0.9_" in r.json()["package_name"]
        # 探测方向 = 第一个启用位置（D8）
        assert probes == [("192.0.2.10", 22)]
        # 回写持久化；第二次备份不再探测
        async with isolated_session() as s:
            row = await s.get(DbBackupConfig, 1)
            assert row.source_name == "10.0.0.9"
        r2 = await async_authed_client.post("/api/v1/db-backup/run")
        assert r2.status_code == 200, r2.text
        assert "panshi_backup_10.0.0.9_" in r2.json()["package_name"]
        assert probes == [("192.0.2.10", 22)]  # 未再探测

    async def test_run_manual_backup_flow(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": "t"})
        calls = []
        _fake_remote_ok(monkeypatch, calls)
        monkeypatch.setattr(svc, "_detect_source_raw", lambda h, p: "10.0.0.1")
        # 经 API 种全局配置 + 位置（落在与应用一致的隔离库）
        r0 = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={"enabled": False, "interval_minutes": 5},
        )
        assert r0.status_code == 200, r0.text
        rt = await async_authed_client.post("/api/v1/db-backup/targets", json={
            "name": "局内DR", "host": "192.0.2.10", "username": "backup",
            "password": "s3cret", "remote_dir": "/srv/panshi-dr", "retain_count": 3,
        })
        assert rt.status_code == 200, rt.text
        r = await async_authed_client.post("/api/v1/db-backup/run")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["package_name"].startswith("panshi_backup_")
        assert body["file_size"] > 0
        # 响应含每目标子结果
        assert [t["target_name"] for t in body["targets"]] == ["局内DR"]
        assert body["targets"][0]["status"] == "success"
        # 历史落库（三态 + targets 子结果数组）
        r2 = await async_authed_client.get("/api/v1/db-backup/history")
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert items and items[0]["status"] == "success" and items[0]["trigger"] == "manual"
        assert [t["target_name"] for t in items[0]["targets"]] == ["局内DR"]

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
        await _seed_target_async()
        assert await svc.scheduler_tick() is False

    async def test_tick_skips_without_enabled_targets(self, async_authed_client, monkeypatch, tmp_path):
        """无启用位置 → 跳过（显示不适用，spec）。"""
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": "t"})
        calls = []
        _fake_remote_ok(monkeypatch, calls)
        await _seed_config_async(enabled=True)
        await _seed_target_async(enabled=False)
        assert await svc.scheduler_tick() is False
        assert not calls, "无启用位置不得触发远端推送"

    async def test_tick_triggers_when_due(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        monkeypatch.setattr(svc, "_app_version_info", lambda: {"app_version": "t", "git_commit": "t"})
        calls = []
        _fake_remote_ok(monkeypatch, calls)
        # 从未备份过 → 到期
        await _seed_config_async(enabled=True)
        await _seed_target_async()
        assert await svc.scheduler_tick() is True
        assert calls, "调度到期应触发远端推送"

    async def test_tick_skips_when_not_due(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        await _seed_config_async(enabled=True, last_run_at=datetime.utcnow())
        await _seed_target_async()
        assert await svc.scheduler_tick() is False

    async def test_tick_retry_after_full_interval_after_failure(
        self, async_authed_client, monkeypatch, tmp_path
    ):
        """失败后不重试风暴：下一周期（30s tick）不再触发，需等满间隔。"""
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        # 刚失败过（last_run_at = now，last_success_at = None）
        await _seed_config_async(enabled=True, last_run_at=datetime.utcnow(), last_success_at=None)
        await _seed_target_async()
        assert await svc.scheduler_tick() is False
        # 10 分钟前失败 → 到期重试
        await _seed_config_async(last_run_at=datetime.utcnow() - timedelta(minutes=10), interval_minutes=5)
        calls = []
        _fake_remote_ok(monkeypatch, calls)
        assert await svc.scheduler_tick() is True


class TestTargetCrud:
    """位置 CRUD + 配置两层化 + 权限切换 db_backup（设计 D9/D6）。"""

    async def test_config_get_returns_targets_and_migrates_legacy(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path
    ):
        """GET /config 首读兜底：存量单行 → 默认位置；响应含 targets 数组。"""
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        from app.models.db_backup import DbBackupConfig

        async with isolated_session() as s:
            s.add(DbBackupConfig(
                id=1, enabled=False, host="192.0.2.10", port=22, username="backup",
                remote_dir="/srv/legacy", retain_count=9, targets_migrated=False,
            ))
            await s.commit()
        r = await async_authed_client.get("/api/v1/db-backup/config")
        assert r.status_code == 200, r.text
        targets = r.json()["config"]["targets"]
        assert len(targets) == 1
        assert targets[0]["name"] == "default"
        assert targets[0]["host"] == "192.0.2.10"
        assert targets[0]["retain_count"] == 9
        assert targets[0]["enabled"] is True
        assert "password" not in targets[0]

    async def test_put_config_ignores_target_fields(
        self, async_authed_client, isolated_session, monkeypatch, tmp_path
    ):
        """PUT /config 只收全局字段：载荷中的目标字段兼容忽略。"""
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        from app.models.db_backup import DbBackupConfig

        async with isolated_session() as s:
            s.add(DbBackupConfig(
                id=1, enabled=False, host="legacy-host", username="legacy-user",
                remote_dir="/srv/legacy", targets_migrated=True,
            ))
            await s.commit()
        r = await async_authed_client.put(
            "/api/v1/db-backup/config",
            json={
                "enabled": True, "interval_minutes": 10,
                # 旧客户端目标字段 → 忽略，不落库不清空
                "host": "evil-host", "username": "evil-user", "remote_dir": "/evil",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()["config"]
        assert body["interval_minutes"] == 10
        async with isolated_session() as s:
            row = await s.get(DbBackupConfig, 1)
            assert row.host == "legacy-host"  # 未被载荷覆写
            assert row.username == "legacy-user"
            assert row.remote_dir == "/srv/legacy"

    async def test_target_crud_lifecycle(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        # 创建（中文名）
        r = await async_authed_client.post("/api/v1/db-backup/targets", json={
            "name": "局内DR", "host": "192.0.2.10", "port": 22, "username": "backup",
            "auth_type": "password", "password": "s3cret",
            "remote_dir": "/srv/dr", "retain_count": 7, "enabled": True,
        })
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["name"] == "局内DR" and t["has_password"] is True
        assert "password" not in t and "password_encrypted" not in t
        tid = t["id"]
        # 列表
        r2 = await async_authed_client.get("/api/v1/db-backup/targets")
        assert [x["id"] for x in r2.json()["targets"]] == [tid]
        # 更新（密码留空 = 不修改；改保留份数）
        r3 = await async_authed_client.put(f"/api/v1/db-backup/targets/{tid}", json={
            "name": "局内DR", "host": "192.0.2.11", "port": 22, "username": "backup",
            "auth_type": "password", "password": "",
            "remote_dir": "/srv/dr2", "retain_count": 30, "enabled": False,
        })
        assert r3.status_code == 200, r3.text
        t3 = r3.json()
        assert t3["host"] == "192.0.2.11" and t3["retain_count"] == 30
        assert t3["enabled"] is False
        assert t3["has_password"] is True  # 密码留空 → 保留
        # 密码保持可用：删除后测试连通走载荷，不依赖这里；直接验证库内密文未变长度
        # 删除
        r4 = await async_authed_client.delete(f"/api/v1/db-backup/targets/{tid}")
        assert r4.status_code == 200
        r5 = await async_authed_client.get("/api/v1/db-backup/targets")
        assert r5.json()["targets"] == []

    async def test_target_duplicate_name_rejected(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        payload = {
            "name": "中心机房", "host": "192.0.2.10", "username": "backup",
            "remote_dir": "/srv/dr", "retain_count": 7,
        }
        r1 = await async_authed_client.post("/api/v1/db-backup/targets", json=payload)
        assert r1.status_code == 200
        r2 = await async_authed_client.post("/api/v1/db-backup/targets", json=payload)
        assert r2.status_code == 422

    async def test_target_invalid_values_rejected(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        base = {"host": "192.0.2.10", "username": "backup", "remote_dir": "/srv/dr"}
        for name in ("a/b", " name", "name ", ""):
            r = await async_authed_client.post(
                "/api/v1/db-backup/targets", json={"name": name, **base, "retain_count": 7}
            )
            assert r.status_code == 422, name
        r = await async_authed_client.post(
            "/api/v1/db-backup/targets", json={"name": "ok", **base, "retain_count": 0}
        )
        assert r.status_code == 422

    async def test_target_test_uses_payload(self, async_authed_client, monkeypatch, tmp_path):
        """按载荷测连（可先于保存）。"""
        calls = []
        _fake_remote_ok(monkeypatch, calls)
        r = await async_authed_client.post("/api/v1/db-backup/targets/test", json={
            "host": "192.0.2.99", "username": "u1", "password": "pw", "auth_type": "password",
        })
        assert r.status_code == 200
        assert r.json()["ok"] is True
        argv = " ".join(calls[0])
        assert "192.0.2.99" in argv
        assert "pw" not in argv  # SSHPASS 环境变量

    async def test_non_admin_without_db_backup_permission_forbidden(
        self, async_authed_client, monkeypatch, tmp_path
    ):
        """有认证但无 db_backup 权限 → 403（权限键从 database_management 切换）。"""
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        import uuid

        username = f"bk_noperm_{uuid.uuid4().hex[:6]}"
        created = await async_authed_client.post("/api/v1/admin/users", json={
            "username": username, "password": "pass123", "role": "user", "status": 1,
        })
        assert created.status_code in (200, 201), created.text
        login = await async_authed_client.post(
            "/api/v1/auth/login", json={"username": username, "password": "pass123"}
        )
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        for method, path in (
            ("get", "/api/v1/db-backup/config"),
            ("get", "/api/v1/db-backup/targets"),
            ("post", "/api/v1/db-backup/targets"),
            ("post", "/api/v1/db-backup/run"),
        ):
            kwargs = {"json": {}} if method == "post" else {}
            r = await getattr(async_authed_client, method)(path, headers=headers, **kwargs)
            assert r.status_code == 403, f"{method} {path}: {r.status_code}"


class TestRestoreListApi:
    """恢复列包 API：target_id / 手输 / 聚合三种模式与二选一校验（设计 D6/D9）。"""

    async def test_target_id_and_manual_are_exclusive(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        r = await async_authed_client.post("/api/v1/db-backup/restore/list", json={
            "target_id": 1, "host": "192.0.2.10", "username": "u", "password": "pw",
        })
        assert r.status_code == 422
        assert "二选一" in r.json()["detail"]

    async def test_aggregate_mode_without_params(self, async_authed_client, monkeypatch, tmp_path):
        """无 target_id 且无手输 → 聚合全部已配置位置。"""
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)

        async def fake_agg(db=None):
            return {
                "packages": [{"package_name": "panshi_backup_a_20260930_120000.tar.gz", "file_size": 10,
                              "_present": [{"target_id": 1, "target_name": "局内DR"}]}],
                "targets_status": [{"target_id": 1, "target_name": "局内DR", "status": "ok", "error": None}],
                "hint": None,
            }

        from app.services import db_restore_service as rst

        monkeypatch.setattr(rst, "list_aggregated", fake_agg)
        r = await async_authed_client.post("/api/v1/db-backup/restore/list", json={})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["targets_status"][0]["target_name"] == "局内DR"
        pkg = body["packages"][0]
        assert pkg["name"] == "panshi_backup_a_20260930_120000.tar.gz"
        assert pkg["present_in"] == [{"target_id": 1, "target_name": "局内DR"}]

    async def test_target_id_mode_resolves_position(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        from app.models.db_backup import DbBackupTarget

        rt = await async_authed_client.post("/api/v1/db-backup/targets", json={
            "name": "局内DR", "host": "192.0.2.10", "username": "backup",
            "password": "s3cret", "remote_dir": "/srv/dr", "retain_count": 7,
        })
        assert rt.status_code == 200, rt.text
        tid = rt.json()["id"]
        seen = []

        async def fake_list(target):
            seen.append(target)
            return [{"package_name": "panshi_backup_a_20260930_120000.tar.gz", "file_size": 5,
                     "_present": []}]

        from app.services import db_restore_service as rst

        monkeypatch.setattr(rst, "list_remote_packages", fake_list)
        r = await async_authed_client.post("/api/v1/db-backup/restore/list", json={"target_id": tid})
        assert r.status_code == 200, r.text
        assert seen and seen[0]["host"] == "192.0.2.10"
        assert seen[0]["password"] == "s3cret"  # 凭据解密注入
        assert r.json()["packages"][0]["name"].startswith("panshi_backup_a_")

    async def test_target_id_not_found(self, async_authed_client, monkeypatch, tmp_path):
        cfg = _mkcfg(tmp_path)
        monkeypatch.setattr(dbc, "load_config", lambda: cfg)
        r = await async_authed_client.post("/api/v1/db-backup/restore/list", json={"target_id": 999})
        assert r.status_code == 404
