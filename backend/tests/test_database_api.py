"""Integration tests for database management API (connections CRUD / status / test)."""

import json
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

from app.core import db_config
from app.core.db_config import DbConfig, ConnectionConfig, encrypt_password


@pytest.fixture(autouse=True)
def _isolate_config(tmp_path, monkeypatch):
    monkeypatch.setattr(db_config, "CONFIG_PATH", str(tmp_path / "db_config.json"))
    monkeypatch.setattr(db_config, "CONFIG_BAK_PATH", str(tmp_path / "db_config.json.bak"))
    # seed a default config so endpoints have something to read
    cfg = DbConfig(version=1, active="local_sqlite", connections=[
        ConnectionConfig(id="local_sqlite", type="sqlite", name="本地 SQLite", path=str(tmp_path / "panshi.db")),
    ])
    db_config.save_config(cfg, path=str(tmp_path / "db_config.json"))
    yield


class TestDatabaseAPI:
    async def _login(self, client, username="admin", password="panshi123"):
        resp = await client.post("/api/v1/auth/login",
            json={"username": username, "password": password})
        assert resp.status_code == 200
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    async def test_status_returns_active_connection(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.get("/api/v1/database/status", headers=headers)
            assert resp.status_code == 200
            data = resp.json()
            assert data["active"]["type"] == "sqlite"
            assert "password_enc" not in data["active"]
            assert data["active"]["password_set"] is False

    async def test_list_connections_masked(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.get("/api/v1/database/connections", headers=headers)
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)
            conn = data[0]
            assert "password_enc" not in conn
            assert "password" not in conn

    async def test_create_postgres_connection(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.post("/api/v1/database/connections", headers=headers, json={
                "type": "postgres", "name": "生产 PG", "host": "192.168.1.10",
                "port": 5432, "database": "panshi", "username": "panshi", "password": "secret",
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["type"] == "postgres"
            assert data["password_set"] is True
            assert "password_enc" not in data
            # persisted encrypted in config
            stored = db_config.load_config()
            pg = stored.get_connection(data["id"])
            assert pg is not None
            assert db_config.decrypt_password(pg.password_enc) == "secret"

    async def test_create_sqlite_connection(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.post("/api/v1/database/connections", headers=headers, json={
                "type": "sqlite", "name": "备份 SQLite", "path": "./data/backup.db",
            })
            assert resp.status_code == 200
            assert resp.json()["type"] == "sqlite"
            assert resp.json()["password_set"] is False

    async def test_update_connection(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            created = await client.post("/api/v1/database/connections", headers=headers, json={
                "type": "postgres", "name": "PG1", "host": "h1", "database": "d1",
                "username": "u", "password": "p1",
            })
            conn_id = created.json()["id"]
            resp = await client.put(f"/api/v1/database/connections/{conn_id}", headers=headers, json={
                "name": "PG Renamed", "host": "h2", "database": "d2",
                "username": "u2", "password": "p2",
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["name"] == "PG Renamed"
            assert data["host"] == "h2"
            stored = db_config.load_config().get_connection(conn_id)
            assert db_config.decrypt_password(stored.password_enc) == "p2"

    async def test_delete_non_active_connection(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            created = await client.post("/api/v1/database/connections", headers=headers, json={
                "type": "postgres", "name": "PG", "host": "h", "database": "d", "username": "u",
            })
            conn_id = created.json()["id"]
            resp = await client.delete(f"/api/v1/database/connections/{conn_id}", headers=headers)
            assert resp.status_code == 200
            assert db_config.load_config().get_connection(conn_id) is None

    async def test_delete_active_connection_refused(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.delete("/api/v1/database/connections/local_sqlite", headers=headers)
            assert resp.status_code == 400

    async def test_test_connection_sqlite_success(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.post("/api/v1/database/connections/local_sqlite/test", headers=headers)
            assert resp.status_code == 200
            assert resp.json()["success"] is True

    async def test_non_admin_forbidden(self):
        import uuid
        username = f"db_noadmin_{uuid.uuid4().hex[:6]}"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            admin_headers = await self._login(client)
            created = await client.post("/api/v1/admin/users", headers=admin_headers, json={
                "username": username, "password": "pass123", "role": "user", "status": 1,
            })
            assert created.status_code in (200, 201), created.text
            login = await client.post("/api/v1/auth/login",
                json={"username": username, "password": "pass123"})
            assert login.status_code == 200
            user_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            resp = await client.get("/api/v1/database/connections", headers=user_headers)
            assert resp.status_code == 403
            uid = created.json()["id"]
            await client.delete(f"/api/v1/admin/users/{uid}", headers=admin_headers)

    async def test_unauthorized_returns_401(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/database/connections")
            assert resp.status_code == 401

    async def test_switch_to_reachable_sqlite(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            import tempfile, os
            path = os.path.join(tempfile.gettempdir(), "switch_target.db")
            created = await client.post("/api/v1/database/connections", headers=headers, json={
                "type": "sqlite", "name": "切换目标", "path": path,
            })
            conn_id = created.json()["id"]
            resp = await client.post("/api/v1/database/switch", headers=headers,
                json={"connection_id": conn_id})
            assert resp.status_code == 200
            data = resp.json()
            assert "重启" in data["message"]
            assert db_config.load_config().active == conn_id

    async def test_switch_to_unreachable_pg_rejected(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            created = await client.post("/api/v1/database/connections", headers=headers, json={
                "type": "postgres", "name": "坏PG", "host": "127.0.0.1", "port": 1,
                "database": "x", "username": "u",
            })
            conn_id = created.json()["id"]
            resp = await client.post("/api/v1/database/switch", headers=headers,
                json={"connection_id": conn_id})
            assert resp.status_code == 400
            assert "不可达" in resp.json()["detail"]

class TestMigrationEndpoints:
    async def _login(self, client):
        resp = await client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    async def _add_sqlite(self, client, headers, name, path):
        resp = await client.post("/api/v1/database/connections", headers=headers, json={
            "type": "sqlite", "name": name, "path": path,
        })
        return resp.json()["id"]

    async def test_migrate_same_source_target_400(self):
        import tempfile, os
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            conn_id = await self._add_sqlite(client, headers, "X", os.path.join(tempfile.gettempdir(), "mig1.db"))
            resp = await client.post("/api/v1/database/migrate", headers=headers, json={
                "source_id": conn_id, "target_id": conn_id, "mode": "replace",
            })
            assert resp.status_code == 400
            assert "相同" in resp.json()["detail"]

    async def test_migrate_to_active_400(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.post("/api/v1/database/migrate", headers=headers, json={
                "source_id": "local_sqlite", "target_id": "local_sqlite", "mode": "replace",
            })
            assert resp.status_code == 400

    async def test_migrate_unsupported_mode_400(self):
        # 主规格：仅支持替换模式；merge 等其他模式必须显式拒绝
        import tempfile, os
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            conn_id = await self._add_sqlite(client, headers, "T", os.path.join(tempfile.gettempdir(), "mode_t.db"))
            resp = await client.post("/api/v1/database/migrate", headers=headers, json={
                "source_id": "local_sqlite", "target_id": conn_id, "mode": "merge",
            })
            assert resp.status_code == 400
            assert "仅支持替换模式" in resp.json()["detail"]

    async def test_history_returns_200(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.get("/api/v1/database/history", headers=headers)
            assert resp.status_code == 200
            assert isinstance(resp.json(), list)

    async def test_export_creates_archive(self):
        import tempfile, os
        from sqlalchemy import create_engine
        from app.core.database import Base
        from app.models.cluster import Cluster
        from sqlalchemy.orm import Session
        path = os.path.join(tempfile.gettempdir(), "export_src.db")
        if os.path.exists(path):
            os.remove(path)  # 固定路径残留会使重复运行时 id=1 插入撞唯一约束
        engine = create_engine(f"sqlite:///{path}")
        Base.metadata.create_all(engine)
        with Session(engine) as s:
            s.add(Cluster(id=1, name="a"))
            s.commit()
        engine.dispose()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            conn_id = await self._add_sqlite(client, headers, "src", path)
            resp = await client.post("/api/v1/database/export", headers=headers, json={"source_id": conn_id})
            assert resp.status_code == 200
            data = resp.json()
            assert os.path.exists(data["archive_path"])

    async def test_import_missing_archive_400(self):
        import tempfile, os
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            conn_id = await self._add_sqlite(client, headers, "tgt", os.path.join(tempfile.gettempdir(), "imp.db"))
            resp = await client.post("/api/v1/database/import", headers=headers, json={
                "archive_path": os.path.join(tempfile.gettempdir(), "nope.zip"),
                "target_id": conn_id,
            })
            assert resp.status_code == 400
