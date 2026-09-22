"""区域注册表 API 测试（openspec: add-relay-gateway / relay-region-registry）。

覆盖：CRUD、code 格式/唯一/不可变、删除挂接约束、启停、集群 region_code 挂接。
"""
import pytest

from app.main import app
from app.core.database import get_db
from app.models.user import User
from app.core.security import hash_password
from app.models.cluster import Cluster
from app.models.relay import RelayGateway
from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

CODE_PATTERN_MSG = "区域code格式错误"


class TestRelayGatewayApi:
    @pytest.fixture
    def client(self, test_db, test_db_factory):
        async def override_get_db():
            async with test_db_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db

        import asyncio

        async def _seed():
            if await test_db.get(User, 1) is None:
                test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                                 role="admin", status=1))
            if await test_db.get(Cluster, 1) is None:
                test_db.add(Cluster(id=1, name="c1", status=1))
            await test_db.commit()
        asyncio.run(_seed())

        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            yield c
        app.dependency_overrides.clear()

    # ── 创建 ────────────────────────────────────────────────
    def test_create_region(self, client):
        resp = client.post("/api/v1/relay/gateways", json={
            "code": "luju", "name": "路局A",
            "http_base_url": "http://10.10.1.1:8443",
            "ssh_jump": "tunnel@10.10.1.1:22",
        })
        assert resp.status_code in (200, 201), resp.text
        body = resp.json()
        assert body["code"] == "luju"
        assert body["status"] == "enabled"

    def test_create_duplicate_code_rejected(self, client):
        client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A"})
        resp = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "另一个"})
        assert resp.status_code == 400

    def test_create_invalid_code_rejected(self, client):
        for bad in ("Luju_1", "1abc", "-abc", "a" * 40):
            resp = client.post("/api/v1/relay/gateways", json={"code": bad, "name": "x"})
            assert resp.status_code in (400, 422), f"code={bad} 应被拒绝"
            assert CODE_PATTERN_MSG in resp.json().get("detail", "") or resp.status_code == 422

    # ── 列表 / 更新 ─────────────────────────────────────────
    def test_list_regions(self, client):
        client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A"})
        client.post("/api/v1/relay/gateways", json={"code": "tianjin", "name": "路局B"})
        resp = client.get("/api/v1/relay/gateways")
        assert resp.status_code == 200
        codes = {r["code"] for r in resp.json()}
        assert {"luju", "tianjin"} <= codes

    def test_update_code_immutable(self, client):
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A"}).json()
        rid = created["id"]
        resp = client.put(f"/api/v1/relay/gateways/{rid}", json={"code": "tianjin"})
        assert resp.status_code == 400
        # 其余字段允许更新
        resp = client.put(f"/api/v1/relay/gateways/{rid}", json={"name": "路局A改名", "status": "disabled"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "路局A改名"
        assert resp.json()["status"] == "disabled"

    # ── 删除挂接约束 ────────────────────────────────────────
    def test_delete_attached_region_rejected(self, client, test_db):
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A"}).json()
        import asyncio

        async def _attach():
            c = await test_db.get(Cluster, 1)
            c.region_code = "luju"
            await test_db.commit()
        asyncio.run(_attach())
        resp = client.delete(f"/api/v1/relay/gateways/{created['id']}")
        assert resp.status_code == 409
        assert "挂接" in resp.json()["detail"]
        assert "seed-cluster-1" in resp.json()["detail"]

    def test_delete_unattached_region_ok(self, client):
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A"}).json()
        resp = client.delete(f"/api/v1/relay/gateways/{created['id']}")
        assert resp.status_code in (200, 204)

    # ── 集群挂接 ────────────────────────────────────────────
    def test_cluster_region_attach(self, client):
        client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A"})
        resp = client.put("/api/v1/clusters/1", json={"region_code": "luju"})
        assert resp.status_code == 200
        assert resp.json()["region_code"] == "luju"

    def test_cluster_region_attach_invalid_rejected(self, client):
        resp = client.put("/api/v1/clusters/1", json={"region_code": "nonexistent"})
        assert resp.status_code == 400

    def test_cluster_region_clear(self, client):
        client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A"})
        client.put("/api/v1/clusters/1", json={"region_code": "luju"})
        resp = client.put("/api/v1/clusters/1", json={"region_code": None})
        assert resp.status_code == 200
        assert resp.json()["region_code"] is None

    # ── 未认证访问 ──────────────────────────────────────────
    def test_unauthenticated_rejected(self, test_db, test_db_factory):
        from fastapi.testclient import TestClient
        from fastapi import FastAPI

        async def override_get_db():
            async with test_db_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        import asyncio

        async def _seed():
            if await test_db.get(User, 1) is None:
                test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                                 role="admin", status=1))
            await test_db.commit()
        asyncio.run(_seed())
        try:
            with isolated_app_lifespan(), TestClient(app) as bare:
                assert bare.get("/api/v1/relay/gateways").status_code in (401, 403)
                assert bare.post("/api/v1/relay/gateways", json={"code": "x", "name": "x"}).status_code in (401, 403)
        finally:
            app.dependency_overrides.clear()


class TestRelayHealthEndpoint:
    @pytest.fixture
    def client(self, test_db, test_db_factory):
        async def override_get_db():
            async with test_db_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        import asyncio
        from app.models.relay import RelayGateway as RG

        async def _seed():
            if await test_db.get(User, 1) is None:
                test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                                 role="admin", status=1))
            if await test_db.get(RG, 1) is None:
                test_db.add(RG(id=1, code="luju", name="路局A",
                               http_base_url="https://10.10.1.1:8443", ssh_jump="tunnel@10.10.1.1:22"))
            await test_db.commit()
        asyncio.run(_seed())
        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            yield c
        app.dependency_overrides.clear()

    def test_health_check_region_unknown_404(self, client):
        resp = client.get("/api/v1/relay/health-check?region=nope")
        assert resp.status_code == 404

    def test_health_check_region_shape(self, client):
        resp = client.get("/api/v1/relay/health-check?region=luju")
        assert resp.status_code == 200
        body = resp.json()
        assert body["region"] == "luju"
        assert len(body["segments"]) == 3
        assert [s["name"] for s in body["segments"]] == ["网关HTTP腿", "SSH跳板", "抽样节点两腿"]
