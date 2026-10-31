"""迁移写锁 503 文案出口化 + started_at naive UTC（db-migration-ux-optimization 任务 2.1）。

约定 #26：后端时间一律 naive UTC —— maintenance.started_at 曾用 datetime.now()，
UTC+8 机器上比 utcnow 快 8 小时，前端 parseBackendDate 按 UTC 解析会得到未来时间。

503 detail（design.md 文案对照表）：旧文案「正在迁移数据库，暂时禁止写操作，
请稍后重试」无出口指引；新文案含源→目标标识（连接名优先、拿不到回退 ID）、
「完成后自动恢复」与「进度见『数据迁移』页」指引。

夹具风格沿用 test_maintenance.py（toy app + autouse 清锁）；
db_config.load_config 打桩，避免断言依赖真实 backend/db_config.json 内容。
"""

from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import db_config, maintenance


@pytest.fixture(autouse=True)
def _reset():
    """进出都清锁：任何用例失败也不把全局锁泄漏给后续用例。"""
    maintenance.set_migration_in_progress(False)
    yield
    maintenance.set_migration_in_progress(False)


def _app():
    app = FastAPI()

    @app.post("/write")
    async def write():
        return {"ok": True}

    app.middleware("http")(maintenance.maintenance_middleware)
    return app


def _conn(conn_id: str, name: str) -> db_config.ConnectionConfig:
    return db_config.ConnectionConfig(
        id=conn_id, type="postgres", name=name, host="10.0.0.8", port=5432, database="panshi"
    )


def _stub_load_config(monkeypatch, connections):
    """把 db_config.load_config 换成内存桩（maintenance 为函数内延迟 import，按模块属性打桩即可）。"""

    def _fake(path=None):
        return db_config.DbConfig(connections=list(connections))

    monkeypatch.setattr(db_config, "load_config", _fake)


class TestStartedAtNaiveUtc:
    def test_started_at_is_naive_utc_within_a_minute(self):
        maintenance.set_migration_in_progress(True, source_id="s", target_id="t")
        started = maintenance.get_migration_state().started_at

        assert started is not None
        assert started.tzinfo is None, "started_at 应为 naive（无时区后缀），约定 #26"
        assert abs(started - datetime.utcnow()) < timedelta(seconds=60), (
            f"started_at={started} 偏离 UTC 超过 60s（旧实现 datetime.now() 在 UTC+8 机器差 8 小时）"
        )


class TestLockedWrite503Detail:
    def _locked_503_detail(self, monkeypatch, source_id, target_id, connections=()) -> str:
        _stub_load_config(monkeypatch, connections)
        maintenance.set_migration_in_progress(True, source_id=source_id, target_id=target_id)
        resp = TestClient(_app()).post("/write")
        assert resp.status_code == 503
        return resp.json()["detail"]

    def test_detail_contains_named_source_target_and_exit_guidance(self, monkeypatch):
        detail = self._locked_503_detail(
            monkeypatch,
            "src_1",
            "tgt_1",
            connections=[_conn("src_1", "本地SQLite"), _conn("tgt_1", "测试PG库")],
        )
        assert "本地SQLite → 测试PG库" in detail, f"503 detail 应含连接名形式的源→目标：{detail}"
        assert "完成后自动恢复" in detail
        assert "进度见『数据迁移』页" in detail
        assert "请稍后重试" not in detail

    def test_detail_falls_back_to_ids_when_connections_unknown(self, monkeypatch):
        detail = self._locked_503_detail(monkeypatch, "ghost-src", "ghost-tgt", connections=[])
        assert "ghost-src → ghost-tgt" in detail, f"连接名拿不到时应回退 ID：{detail}"
        assert "完成后自动恢复" in detail
        assert "进度见『数据迁移』页" in detail
        assert "请稍后重试" not in detail
