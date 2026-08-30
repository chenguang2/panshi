"""ClickHouse 配置管理 API 测试（add-clickhouse-config-page）。

覆盖 specs/clickhouse-config-management 全部场景：CRUD 守卫、密码不回显、
激活/留空保留、test 不落盘、权限 403、审计。
"""

import asyncio
import threading
from types import SimpleNamespace

import pytest
import yaml
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.models.user import User
from tests.api_helpers import AuthedTestClient, auth_headers_for

import app.services.clickhouse_client as ch
import app.api.v1.clickhouse_config as ck


@pytest.fixture
def env(tmp_path, monkeypatch):
    """in-memory DB（admin id=1 / 普通用户 id=2）+ tmp 配置文件，返回 (client工厂, helpers)。"""
    from app.main import app

    cfg_path = tmp_path / "clickhouse.yaml"
    monkeypatch.setattr(ch, "_CONFIG_PATH", cfg_path)
    monkeypatch.setattr(ch, "_LEGACY_CONFIG_PATH", tmp_path / "nonexistent.yaml")
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with S() as s:
            s.add(User(id=1, username="admin", password_hash=hash_password("x"), role="admin", status=1))
            s.add(User(id=2, username="alice", password_hash=hash_password("x"), role="user", status=1))
            await s.commit()
        return S

    S = asyncio.run(_setup())

    async def override_get_db():
        async with S() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    def client_for(user_id: int) -> AuthedTestClient:
        return AuthedTestClient(app, headers=auth_headers_for(user_id))

    def read_file():
        return yaml.safe_load(cfg_path.read_text(encoding="utf-8")) if cfg_path.exists() else None

    def audit_rows():
        from sqlalchemy import select
        from app.models.system import AuditLog

        async def _f():
            async with S() as s:
                return (await s.execute(select(AuditLog))).scalars().all()
        return asyncio.run(_f())

    yield SimpleNamespace(client_for=client_for, path=cfg_path, read_file=read_file,
                          audit_rows=audit_rows, S=S)

    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


VALID_BODY = {"name": "生产指标库", "host": "10.0.0.8", "port": 9000,
              "database": "esapm", "user": "ck", "password": "***", "connect_timeout": 5}


# ── CRUD ─────────────────────────────────────────────────────────────

def test_get_empty_and_first_create_becomes_active(env):
    with env.client_for(1) as c:
        r = c.get("/api/v1/clickhouse/connections")
        assert r.status_code == 200
        assert r.json()["items"] == [] and r.json()["active"] in (None, "")

        r = c.post("/api/v1/clickhouse/connections", json=VALID_BODY)
        assert r.status_code == 200
        data = r.json()
        cid = data["id"]

        r = c.get("/api/v1/clickhouse/connections")
        got = r.json()
        assert got["active"] == cid
        item = got["items"][0]
        assert item["is_active"] is True
        assert item["password_set"] is True
        # 永不回显密码（含任何形态的键）
        assert "password" not in item and "password_enc" not in item
    # 落盘文件为密文，无明文
    raw = env.read_file()
    conn = [x for x in raw["connections"] if x["id"] == cid][0]
    assert "password" not in conn and conn["password_enc"]


def test_invalid_port_rejected(env):
    with env.client_for(1) as c:
        r = c.post("/api/v1/clickhouse/connections", json={**VALID_BODY, "port": 0})
        assert r.status_code == 422
        r = c.post("/api/v1/clickhouse/connections", json={**VALID_BODY, "host": ""})
        assert r.status_code == 422
        assert env.read_file() is None  # 未写盘


def test_update_blank_password_keeps(env):
    with env.client_for(1) as c:
        cid = c.post("/api/v1/clickhouse/connections", json=VALID_BODY).json()["id"]
        r = c.put(f"/api/v1/clickhouse/connections/{cid}",
                  json={**{k: v for k, v in VALID_BODY.items() if k != "password"},
                        "password": ""})
        assert r.status_code == 200
        raw = env.read_file()
        conn = [x for x in raw["connections"] if x["id"] == cid][0]
        assert conn["host"] == "10.0.0.8"
        assert conn["password_enc"]  # 原密文保留（token 前缀特征）


def test_update_unknown_id_404(env):
    with env.client_for(1) as c:
        c.post("/api/v1/clickhouse/connections", json=VALID_BODY)
        r = c.put("/api/v1/clickhouse/connections/ck_zzz", json=VALID_BODY)
        assert r.status_code == 404


def test_delete_active_rejected_other_ok(env):
    with env.client_for(1) as c:
        c1 = c.post("/api/v1/clickhouse/connections", json=VALID_BODY).json()["id"]
        c2 = c.post("/api/v1/clickhouse/connections",
                    json={**VALID_BODY, "name": "备份源", "host": "10.0.0.9"}).json()["id"]
        r = c.delete(f"/api/v1/clickhouse/connections/{c1}")
        assert r.status_code == 400  # active 拒删
        r = c.post("/api/v1/clickhouse/activate", json={"id": c2})
        assert r.status_code == 200
        r = c.delete(f"/api/v1/clickhouse/connections/{c1}")
        assert r.status_code == 200
        assert len(env.read_file()["connections"]) == 1


def test_activate_updates_and_invalidates(env, monkeypatch):
    calls = []
    monkeypatch.setattr(ch, "invalidate", lambda: calls.append(1))
    with env.client_for(1) as c:
        c1 = c.post("/api/v1/clickhouse/connections", json=VALID_BODY).json()["id"]
        c2 = c.post("/api/v1/clickhouse/connections",
                    json={**VALID_BODY, "name": "二", "host": "10.0.0.9"}).json()["id"]
        r = c.post("/api/v1/clickhouse/activate", json={"id": "ck_missing"})
        assert r.status_code == 404
        n_before = len(calls)
        r = c.post("/api/v1/clickhouse/activate", json={"id": c2})
        assert r.status_code == 200
        assert env.read_file()["active"] == c2
        assert len(calls) == n_before + 1


def test_mutations_invalidate_and_audit(env, monkeypatch):
    calls = []
    monkeypatch.setattr(ch, "invalidate", lambda: calls.append(1))
    with env.client_for(1) as c:
        cid = c.post("/api/v1/clickhouse/connections", json=VALID_BODY).json()["id"]
        c.put(f"/api/v1/clickhouse/connections/{cid}",
              json={**VALID_BODY, "host": "10.0.0.7"})
        c.post("/api/v1/clickhouse/activate", json={"id": cid})
    assert len(calls) >= 3  # create/update/activate 各触发
    rows = env.audit_rows()
    assert rows and all("ck_password" not in (r.detail or "") + (r.action or "") for r in rows)
    assert any(r.resource == "clickhouse_config" for r in rows)


# ── 测试连接 ─────────────────────────────────────────────────────────

def test_test_endpoints_do_not_touch_file(env, monkeypatch):
    class _Ok:
        # 只暴露 clickhouse-driver 真实 API（防实现调不存在方法再次溜过）
        def __init__(self, **kw):
            pass
        def execute(self, sql):
            assert sql == "SELECT 1"
        def disconnect(self):
            pass

    monkeypatch.setattr(ck, "Client", _Ok)
    with env.client_for(1) as c:
        before = env.path.read_bytes() if env.path.exists() else None
        cid = c.post("/api/v1/clickhouse/connections", json=VALID_BODY).json()["id"]
        r = c.post(f"/api/v1/clickhouse/connections/{cid}/test", json={})
        assert r.status_code == 200 and r.json()["ok"] is True
        r = c.post("/api/v1/clickhouse/connections/test",
                   json={**VALID_BODY, "password": "***"})
        assert r.status_code == 200 and r.json()["ok"] is True
        assert env.read_file()["connections"][0]["id"] == cid  # 仅列表不变结构
        # 用已存连接测：body 密码空 → 用已存（不校验值，Ok fake 都通过）


def test_test_failure_returns_ok_false(env, monkeypatch):
    class _Boom:
        def __init__(self, **kw):
            raise RuntimeError("Code: 210 Connection refused")
        def disconnect(self):
            pass

    monkeypatch.setattr(ck, "Client", _Boom)
    with env.client_for(1) as c:
        r = c.post("/api/v1/clickhouse/connections/test", json=VALID_BODY)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is False and "Connection refused" in body["error"]


# ── 权限 ─────────────────────────────────────────────────────────────

def test_permission_required(env):
    with env.client_for(2) as c:  # 普通用户无 clickhouse_config 权限
        assert c.get("/api/v1/clickhouse/connections").status_code == 403
        assert c.post("/api/v1/clickhouse/connections", json=VALID_BODY).status_code == 403


def test_permission_granted_user_ok(env):
    from app.models.user import UserPermission
    async def _grant():
        async with env.S() as s:
            s.add(UserPermission(user_id=2, resource_type="clickhouse_config", enabled=1))
            await s.commit()
    asyncio.run(_grant())
    with env.client_for(2) as c:
        assert c.get("/api/v1/clickhouse/connections").status_code == 200


# ── 旧格式兼容（GET 视图） ───────────────────────────────────────────

def test_legacy_plaintext_view_migrates_on_save(env):
    env.path.write_text(yaml.safe_dump({
        "host": "192.168.1.1", "port": 9000, "database": "esapm_metrics",
        "user": "default", "password": "legacy-pw", "connect_timeout": 5,
    }), encoding="utf-8")
    with env.client_for(1) as c:
        r = c.get("/api/v1/clickhouse/connections")
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1 and items[0]["password_set"] is True
        # 保存一次 → 文件转新格式且明文键消失
        cid = items[0]["id"]
        body = {k: v for k, v in VALID_BODY.items() if k != "password"}  # 不带密码 → 迁移保留原明文等效密码
        body["host"] = "192.168.1.1"
        c.put(f"/api/v1/clickhouse/connections/{cid}", json=body)
    raw = env.read_file()
    assert "connections" in raw and raw["connections"][0].get("password_enc")
    assert all("password" not in c for c in raw["connections"])  # 明文键消失
    # 已存连接测试密码留空 → 用 legacy 明文等效解密路径验证：旧明文经 PUT 迁移为密文
    from app.core.db_config import decrypt_password
    assert decrypt_password(raw["connections"][0]["password_enc"]) == "legacy-pw"
