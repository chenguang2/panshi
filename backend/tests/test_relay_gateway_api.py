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


def _sse_events(text: str) -> list[dict]:
    """解析 SSE 响应体为事件 dict 列表（json.dumps 默认转义中文，需按 JSON 解码）。"""
    import json

    events: list[dict] = []
    for chunk in text.split("\n\n"):
        chunk = chunk.strip()
        if chunk.startswith("data: "):
            events.append(json.loads(chunk[len("data: "):]))
    return events


@pytest.fixture(autouse=True)
def _reset_relay_inflight():
    """init/push 的同区域并发占位是进程级内存集合：用例间隔离。"""
    from app.api.v1 import relay

    relay._INFLIGHT.clear()
    yield
    relay._INFLIGHT.clear()


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

    # ── init / push：SSE 流式（同节点安装） ──────────────────
    @pytest.fixture
    def gateway_inventory(self, monkeypatch, tmp_path):
        from app.services import relay_init, relay_push

        inv = tmp_path / "gateways"
        inv.write_text("[gateways_luju]\n10.10.1.1\n", encoding="utf-8")
        monkeypatch.setattr(relay_init, "_GATEWAYS_INVENTORY", str(inv))
        monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", str(inv))
        return inv

    def test_init_requires_openresty_prefix(self, client):
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/init")
        assert resp.status_code == 400
        assert "openresty_prefix" in resp.json()["detail"]
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config")
        assert resp.status_code == 400
        assert "openresty_prefix" in resp.json()["detail"]

    def test_init_streams_events(self, client, gateway_inventory, monkeypatch):
        from app.services import relay_init

        def fake_run(**kw):
            assert kw.get("event_handler") is not None
            kw["event_handler"]({"stdout": "PLAY [初始化中继网关]"})
            return {"rc": 0, "status": "successful"}

        monkeypatch.setattr(relay_init, "_run_ansible_init", fake_run)
        created = client.post("/api/v1/relay/gateways", json={
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/init")
        assert resp.status_code == 200, resp.text
        assert "text/event-stream" in resp.headers["content-type"]
        events = _sse_events(resp.text)
        assert "PLAY [初始化中继网关]" in [e["line"] for e in events if "line" in e]
        final = events[-1]
        assert final["percent"] == 100
        assert final["rc"] == 0
        assert final["hosts_pattern"] == "gateways_luju"

    def test_push_streams_events(self, client, gateway_inventory, monkeypatch):
        from app.services import relay_push

        def fake_run(**kw):
            assert kw.get("event_handler") is not None
            kw["event_handler"]({"stdout": "TASK [写入白名单 map]"})
            return {"rc": 0, "status": "successful"}

        monkeypatch.setattr(relay_push, "_run_ansible_push", fake_run)
        created = client.post("/api/v1/relay/gateways", json={
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config")
        assert resp.status_code == 200, resp.text
        assert "text/event-stream" in resp.headers["content-type"]
        events = _sse_events(resp.text)
        assert "TASK [写入白名单 map]" in [e["line"] for e in events if "line" in e]
        assert events[-1]["rc"] == 0

    def test_busy_region_returns_409(self, client, gateway_inventory):
        from app.api.v1 import relay

        created = client.post("/api/v1/relay/gateways", json={
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        relay._INFLIGHT.add("luju")
        try:
            resp = client.post(f"/api/v1/relay/gateways/{created['id']}/init")
            assert resp.status_code == 409
            assert "进行中" in resp.json()["detail"]
        finally:
            relay._INFLIGHT.discard("luju")

    def test_init_trigger_is_audited(self, client, test_db_factory, gateway_inventory, monkeypatch):
        """SSE 端点必须在交出流前 commit 触发审计：否则审计骨架随 get_db 会话回滚丢失。"""
        import asyncio

        from sqlalchemy import select

        from app.models.system import AuditLog
        from app.services import relay_init

        monkeypatch.setattr(relay_init, "_run_ansible_init",
                            lambda **kw: {"rc": 0, "status": "successful"})
        created = client.post("/api/v1/relay/gateways", json={
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/init")
        assert resp.status_code == 200, resp.text

        async def _actions():
            async with test_db_factory() as session:
                rows = await session.execute(select(AuditLog.action))
                return list(rows.scalars().all())

        assert "relay_gateway_init" in asyncio.run(_actions())

    # ── 配置预览（只读，供界面复制 / ansible 不可用时手工配置） ──────────
    def test_config_preview_includes_files(self, client, test_db):
        import asyncio

        from app.models.cluster import Cluster, Node

        async def _seed():
            cluster = Cluster(name="c1", display_name="集群1", region_code="luju")
            test_db.add(cluster)
            await test_db.commit()
            test_db.add(Node(cluster_id=cluster.id, ip="10.20.0.9", ssh_port=22,
                             management_port=9180, edge_path="/opt/edge", status=1))
            await test_db.commit()

        asyncio.run(_seed())
        created = client.post("/api/v1/relay/gateways", json={
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/openresty"}).json()
        resp = client.get(f"/api/v1/relay/gateways/{created['id']}/config-preview")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        paths = [f["path"] for f in body["files"]]
        assert "/opt/openresty/conf/relay_8443.conf" in paths
        assert "/opt/openresty/conf/edge_targets.conf" in paths
        edge = next(f for f in body["files"] if f["path"].endswith("edge_targets.conf"))
        assert '"10.20.0.9:9180"' in edge["content"]
        server = next(f for f in body["files"] if f["path"].endswith("relay_8443.conf"))
        assert "listen 8443;" in server["content"]
        assert body["listen_port"] == 8443
        assert body["region_code"] == "luju"
        assert body["notes"]

    def test_config_preview_requires_prefix(self, client):
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A"}).json()
        resp = client.get(f"/api/v1/relay/gateways/{created['id']}/config-preview")
        assert resp.status_code == 400
        assert "openresty_prefix" in resp.json()["detail"]

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
