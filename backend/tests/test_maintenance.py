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

    app.middleware("http")(maintenance.maintenance_middleware)
    return app


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

    def test_read_allowed_during_migration(self):
        maintenance.set_migration_in_progress(True)
        client = TestClient(_app())
        assert client.get("/read").status_code == 200

    def test_write_allowed_when_not_migrating(self):
        client = TestClient(_app())
        assert client.post("/write").status_code == 200
