"""Tests for app.core.maintenance — migration write-lock (G2)."""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core import maintenance


@pytest.fixture(autouse=True)
def _reset():
    maintenance.set_migration_in_progress(False)
    yield
    maintenance.set_migration_in_progress(False)


def _app():
    app = FastAPI()

    @app.get("/read")
    async def read():
        return {"ok": True}

    @app.post("/write")
    async def write():
        return {"ok": True}

    @app.put("/write")
    async def put():
        return {"ok": True}

    @app.delete("/write")
    async def delete():
        return {"ok": True}

    @app.patch("/write")
    async def patch():
        return {"ok": True}

    app.middleware("http")(maintenance.maintenance_middleware)
    return app


class TestMigrationState:
    """Task 1.1-1.4: MigrationState dataclass replaces bare threading.Event."""

    def test_initial_state_is_not_in_progress(self):
        state = maintenance.get_migration_state()
        assert state.in_progress is False
        assert state.source_id is None
        assert state.target_id is None
        assert state.started_at is None

    def test_set_migration_in_progress_true_records_metadata(self):
        maintenance.set_migration_in_progress(True, source_id="src_1", target_id="tgt_2")
        state = maintenance.get_migration_state()
        assert state.in_progress is True
        assert state.source_id == "src_1"
        assert state.target_id == "tgt_2"
        assert state.started_at is not None

    def test_set_migration_in_progress_false_clears_everything(self):
        maintenance.set_migration_in_progress(True, source_id="src_1", target_id="tgt_2")
        maintenance.set_migration_in_progress(False)
        state = maintenance.get_migration_state()
        assert state.in_progress is False
        assert state.source_id is None
        assert state.target_id is None
        assert state.started_at is None

    def test_migration_in_progress_backward_compat(self):
        """migration_in_progress() reads .in_progress for backward compat."""
        assert maintenance.migration_in_progress() is False
        maintenance.set_migration_in_progress(True, source_id="s", target_id="t")
        assert maintenance.migration_in_progress() is True
        maintenance.set_migration_in_progress(False)
        assert maintenance.migration_in_progress() is False

    def test_set_true_without_metadata_defaults_none(self):
        maintenance.set_migration_in_progress(True)
        state = maintenance.get_migration_state()
        assert state.in_progress is True
        assert state.source_id is None
        assert state.target_id is None

    def test_middleware_still_blocks_writes(self):
        """Middleware integration unchanged by MigrationState refactor."""
        maintenance.set_migration_in_progress(True, source_id="s", target_id="t")
        client = TestClient(_app())
        assert client.post("/write").status_code == 503

    def test_middleware_allows_reads_with_metadata(self):
        maintenance.set_migration_in_progress(True, source_id="s", target_id="t")
        client = TestClient(_app())
        assert client.get("/read").status_code == 200


class TestMaintenanceFlag:
    def test_flag_toggle(self):
        assert maintenance.migration_in_progress() is False
        maintenance.set_migration_in_progress(True)
        assert maintenance.migration_in_progress() is True
        maintenance.set_migration_in_progress(False)
        assert maintenance.migration_in_progress() is False


class TestMaintenanceMiddleware:
    def test_write_blocked_during_migration(self):
        maintenance.set_migration_in_progress(True)
        client = TestClient(_app())
        assert client.post("/write").status_code == 503
        assert client.put("/write").status_code == 503
        assert client.delete("/write").status_code == 503
        assert client.patch("/write").status_code == 503

    def test_read_allowed_during_migration(self):
        maintenance.set_migration_in_progress(True)
        client = TestClient(_app())
        assert client.get("/read").status_code == 200

    def test_write_allowed_when_not_migrating(self):
        client = TestClient(_app())
        assert client.post("/write").status_code == 200

    def test_registered_on_main_app_blocks_writes(self):
        """main.py 注册链路端到端验证：迁移中任意路径的写请求先被拦成 503，
        读请求放行（/health 正常返回），证明中间件真实挂载而非仅单测桩生效。
        注：frontend/dist 存在时未匹配路径会被 SPA 静态回退接住返回 200，
        故读放行断言使用常驻的 /health 路由作确定性依据。"""
        from app.main import app as main_app

        maintenance.set_migration_in_progress(True)
        client = TestClient(main_app)
        assert client.post("/api/v1/__no_such_route__").status_code == 503
        assert client.get("/health").status_code == 200
