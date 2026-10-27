"""ClickHouse 配置 UX 评审修复（clickhouse-config-ux-review-fixes）。

覆盖增量规格场景：试连错误中文转译（error/error_detail）、测试留痕
（last_test_*，参数与缓存不动）、重名 400、summary source_ok。
"""

import asyncio
import threading
from types import SimpleNamespace

import pytest
import yaml
from unittest.mock import patch

import app.services.clickhouse_client as ch
import app.api.v1.clickhouse_config as ck
from app.core.database import get_db
from app.core.security import hash_password
from app.models.user import User
from tests.api_helpers import AuthedTestClient, auth_headers_for

VALID_BODY = {"name": "生产指标库", "host": "10.0.0.8", "port": 9000,
              "database": "esapm", "user": "ck", "password": "***", "connect_timeout": 5}


@pytest.fixture
def env(tmp_path, monkeypatch):
    """in-memory DB（admin id=1）+ tmp 配置文件（同 test_clickhouse_config_api.env）。"""
    from app.main import app

    cfg_path = tmp_path / "clickhouse.yaml"
    monkeypatch.setattr(ch, "_CONFIG_PATH", cfg_path)
    monkeypatch.setattr(ch, "_LEGACY_CONFIG_PATH", tmp_path / "nonexistent.yaml")
    from tests.conftest import _isolated_engine_factory, _prepare_isolated_db

    engine, S, teardown = _isolated_engine_factory()

    async def _setup():
        await _prepare_isolated_db(engine)
        async with S() as s:
            s.add(User(id=1, username="admin", password_hash=hash_password("x"), role="admin", status=1))
            await s.commit()

    asyncio.run(_setup())

    async def override_get_db():
        async with S() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    def read_struct_file():
        return yaml.safe_load(cfg_path.read_text(encoding="utf-8")) if cfg_path.exists() else None

    yield SimpleNamespace(client_for=lambda: AuthedTestClient(app, headers=auth_headers_for(1)),
                          path=cfg_path, read_file=read_struct_file)

    app.dependency_overrides.clear()
    asyncio.run(teardown())


# ── 错误转译（纯单元） ───────────────────────────────────────────────

def test_translate_refused():
    msg, raw = ck._translate_test_error(RuntimeError("Code: 210. Connection refused (127.0.0.1:9000)"),
                                        "127.0.0.1", 9000, "esapm_metrics", 5)
    assert "连接被拒绝" in msg and "127.0.0.1:9000" in msg and "9000" in msg and "8123" in msg
    assert raw == "Code: 210. Connection refused (127.0.0.1:9000)"


def test_translate_auth():
    msg, raw = ck._translate_test_error(RuntimeError("Authentication failed: password is incorrect"),
                                        "10.0.0.8", 9000, "esapm", 5)
    assert "认证失败" in msg and "esapm" in msg and raw.startswith("Authentication failed")


def test_translate_database_missing():
    msg, _ = ck._translate_test_error(RuntimeError("Database esapm_metrics does not exist"),
                                      "10.0.0.8", 9000, "esapm_metrics", 5)
    assert "esapm_metrics 不存在" in msg


def test_translate_dns():
    msg, _ = ck._translate_test_error(RuntimeError("Name or service not known"),
                                      "bad.host.example", 9000, "db", 5)
    assert "无法解析主机" in msg and "bad.host.example" in msg


def test_translate_timeout():
    msg, _ = ck._translate_test_error(RuntimeError("Code: 209. Connection timeout (read 5 s)"),
                                      "10.0.0.8", 9000, "db", 7)
    assert "连接超时" in msg and "7s" in msg


def test_translate_fallback_passthrough():
    raw_text = "some exotic driver failure"
    msg, raw = ck._translate_test_error(RuntimeError(raw_text), "h", 1, "d", 5)
    assert msg == raw_text and raw == raw_text


# ── 测试留痕（参数与缓存不动） ───────────────────────────────────────

class _OkClient:
    def __init__(self, **kw):
        pass

    def execute(self, sql):
        assert sql == "SELECT 1"

    def disconnect(self):
        pass


class _RefusedClient:
    def __init__(self, **kw):
        raise RuntimeError("Code: 210. Connection refused (10.0.0.8:9000)")

    def disconnect(self):
        pass


def _params_of(conn: dict) -> dict:
    return {k: conn.get(k) for k in ("name", "host", "port", "database", "user",
                                     "password_enc", "connect_timeout")}


def test_saved_test_success_records_metadata(env, monkeypatch):
    monkeypatch.setattr(ck, "Client", _OkClient)
    calls = []
    monkeypatch.setattr(ch, "invalidate", lambda: calls.append(1))
    with env.client_for() as c:
        cid = c.post("/api/v1/clickhouse/connections", json=VALID_BODY).json()["id"]
        version_before = ch._config_version
        n_invalidates = len(calls)
        r = c.post(f"/api/v1/clickhouse/connections/{cid}/test", json={})
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True and body["error"] is None and body["error_detail"] is None
        assert body["last_test_ok"] is True and body["last_test_at"]
        # 留痕落盘：参数不动、缓存版本不动、不触发失效
        raw = env.read_file()
        conn = raw["connections"][0]
        assert conn["last_test_ok"] is True and conn["last_test_at"]
        assert _params_of(conn) == _params_of({"name": VALID_BODY["name"], "host": VALID_BODY["host"],
                                               "port": 9000, "database": VALID_BODY["database"],
                                               "user": VALID_BODY["user"], "password_enc": conn["password_enc"],
                                               "connect_timeout": 5})
        assert ch._config_version == version_before and len(calls) == n_invalidates
        # 列表视图暴露留痕字段
        item = c.get("/api/v1/clickhouse/connections").json()["items"][0]
        assert item["last_test_ok"] is True and item["last_test_at"]


def test_saved_test_failure_records_translated_error(env, monkeypatch):
    monkeypatch.setattr(ck, "Client", _RefusedClient)
    with env.client_for() as c:
        cid = c.post("/api/v1/clickhouse/connections", json=VALID_BODY).json()["id"]
        r = c.post(f"/api/v1/clickhouse/connections/{cid}/test", json={})
        body = r.json()
        assert body["ok"] is False
        assert "连接被拒绝" in body["error"] and "10.0.0.8:9000" in body["error"]
        assert "Connection refused" in body["error_detail"]
        conn = env.read_file()["connections"][0]
        assert conn["last_test_ok"] is False and "连接被拒绝" in conn["last_test_error"]


def test_form_test_records_only_with_resolvable_id(env, monkeypatch):
    monkeypatch.setattr(ck, "Client", _OkClient)
    with env.client_for() as c:
        cid = c.post("/api/v1/clickhouse/connections", json=VALID_BODY).json()["id"]
        # 带 id + 密码留空 → 用已存密码并留痕
        r = c.post("/api/v1/clickhouse/connections/test",
                   json={**VALID_BODY, "password": "", "id": cid})
        assert r.json()["ok"] is True and r.json()["last_test_ok"] is True
        # 不带 id（全新表单）→ 不留痕
        c.post("/api/v1/clickhouse/connections/test",
               json={**VALID_BODY, "name": "临时", "password": "x"})
        conns = env.read_file()["connections"]
        assert len(conns) == 1 and conns[0]["id"] == cid and conns[0]["last_test_ok"] is True


# ── 重名拒绝 ─────────────────────────────────────────────────────────

def test_duplicate_name_rejected(env):
    with env.client_for() as c:
        r = c.post("/api/v1/clickhouse/connections", json=VALID_BODY)
        assert r.status_code == 200
        # create 重名（含 trim 变体）
        r = c.post("/api/v1/clickhouse/connections", json=VALID_BODY)
        assert r.status_code == 400 and "已存在" in r.json()["detail"]
        r = c.post("/api/v1/clickhouse/connections", json={**VALID_BODY, "name": "  生产指标库  "})
        assert r.status_code == 400
        # update 其他连接到重名 → 400；保留自身名 → 200
        other = {**VALID_BODY, "name": "备份源", "host": "10.0.0.9", "password": ""}
        cid2 = c.post("/api/v1/clickhouse/connections", json=other).json()["id"]
        r = c.put(f"/api/v1/clickhouse/connections/{cid2}", json={**other, "name": "生产指标库"})
        assert r.status_code == 400 and "已存在" in r.json()["detail"]
        r = c.put(f"/api/v1/clickhouse/connections/{cid2}", json={**other, "name": "  备份源  "})
        assert r.status_code == 200
        # 重名请求不落盘（仍是 2 条）
        assert len(env.read_file()["connections"]) == 2


# ── 指标 summary source_ok（决策 5A 跨页横幅数据源） ─────────────────

def test_summary_source_ok_true(isolated_app):
    # []（执行成功但空结果）即连接可用；None 才是失败
    with patch("app.services.metrics_service.execute_query", return_value=[]):
        resp = isolated_app.get("/api/v1/metrics/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source_ok"] is True and ":" in body["source"]


def test_summary_source_ok_false_when_queries_fail(isolated_app):
    with patch("app.services.metrics_service.execute_query", return_value=None):
        resp = isolated_app.get("/api/v1/metrics/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source_ok"] is False and body["data"] == {}
