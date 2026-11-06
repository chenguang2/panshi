"""区域注册表 API 测试（openspec: add-relay-gateway / relay-region-registry）。

覆盖：CRUD、code 格式/唯一/不可变、删除挂接约束、启停、集群 region_code 挂接。
"""
import json
from datetime import datetime

import pytest

from app.main import app
from app.core.database import get_db
from app.models.user import User
from app.core.security import hash_password
from app.models.cluster import Cluster, Node
from app.models.relay import RelayGateway
from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

CODE_PATTERN_MSG = "区域code格式错误"
FORMAT_MSG_HTTP = "网关 HTTP 腿格式错误"
FORMAT_MSG_SSH = "SSH 跳板格式错误"
FORMAT_MSG_PREFIX = "OpenResty 前缀格式错误"


def _detail_text(resp) -> str:
    """422 的 detail 是 dict 列表（FastAPI 校验错误）、400 是字符串；统一成可断言的可读文本。"""
    import json

    return json.dumps(resp.json().get("detail", ""), ensure_ascii=False)


def _sse_events(text: str) -> list[dict]:
    """解析 SSE 响应体为事件 dict 列表（json.dumps 默认转义中文，需按 JSON 解码）。"""
    import json

    events: list[dict] = []
    for chunk in text.split("\n\n"):
        chunk = chunk.strip()
        if chunk.startswith("data: "):
            events.append(json.loads(chunk[len("data: "):]))
    return events


def _gateway_row(test_db, gateway_id: int) -> RelayGateway:
    """按 id 读回区域行（独立事件循环执行，规避请求内嵌 aio 上下文）。"""
    import asyncio

    return asyncio.run(test_db.get(RelayGateway, gateway_id))


def _seed_region_nodes(test_db, *, enabled: int, disabled: int) -> None:
    """给 seed 集群 c1（id=1）挂接区域 luju 并按数量造启用/禁用节点。"""
    import asyncio

    async def _seed():
        c = await test_db.get(Cluster, 1)
        c.region_code = "luju"
        for i in range(enabled):
            test_db.add(Node(cluster_id=1, ip=f"10.20.0.{i}", ssh_port=22,
                             management_port=9180, edge_path="/opt/edge", status=1))
        for j in range(disabled):
            test_db.add(Node(cluster_id=1, ip=f"10.30.0.{j}", ssh_port=22,
                             management_port=9180, edge_path="/opt/edge", status=0))
        await test_db.commit()
    asyncio.run(_seed())


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
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A",
            "http_base_url": "http://10.10.1.1:8443",
            "ssh_jump": "tunnel@10.10.1.1:22",
        })
        assert resp.status_code in (200, 201), resp.text
        body = resp.json()
        assert body["code"] == "luju"
        assert body["status"] == "enabled"

    def test_create_duplicate_code_rejected(self, client):
        client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"})
        resp = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "另一个", "ssh_user": "jboss"})
        assert resp.status_code == 400

    def test_create_invalid_code_rejected(self, client):
        for bad in ("Luju_1", "1abc", "-abc", "a" * 40):
            resp = client.post("/api/v1/relay/gateways", json={"code": bad, "name": "x", "ssh_user": "jboss"})
            assert resp.status_code in (400, 422), f"code={bad} 应被拒绝"
            assert CODE_PATTERN_MSG in resp.json().get("detail", "") or resp.status_code == 422

    # ── 列表 / 更新 ─────────────────────────────────────────
    def test_list_regions(self, client):
        client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"})
        client.post("/api/v1/relay/gateways", json={"code": "tianjin", "name": "路局B", "ssh_user": "jboss"})
        resp = client.get("/api/v1/relay/gateways")
        assert resp.status_code == 200
        codes = {r["code"] for r in resp.json()}
        assert {"luju", "tianjin"} <= codes

    def test_update_code_immutable(self, client):
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"}).json()
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
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"}).json()
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
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"}).json()
        resp = client.delete(f"/api/v1/relay/gateways/{created['id']}")
        assert resp.status_code in (200, 204)

    # ── 集群挂接 ────────────────────────────────────────────
    def test_cluster_region_attach(self, client):
        client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"})
        resp = client.put("/api/v1/clusters/1", json={"region_code": "luju"})
        assert resp.status_code == 200
        assert resp.json()["region_code"] == "luju"

    def test_cluster_region_attach_invalid_rejected(self, client):
        resp = client.put("/api/v1/clusters/1", json={"region_code": "nonexistent"})
        assert resp.status_code == 400

    def test_cluster_region_clear(self, client):
        client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"})
        client.put("/api/v1/clusters/1", json={"region_code": "luju"})
        resp = client.put("/api/v1/clusters/1", json={"region_code": None})
        assert resp.status_code == 200
        assert resp.json()["region_code"] is None

    # ── init / push：SSE 流式（同节点安装） ──────────────────
    @pytest.fixture
    def gateway_inventory(self, monkeypatch, tmp_path):
        from app.services import relay_init, relay_push

        inv = tmp_path / "gateways"
        inv.write_text("gateways_luju:\n  hosts:\n    10.10.1.1: {}\n", encoding="utf-8")
        monkeypatch.setattr(relay_init, "_GATEWAYS_INVENTORY", str(inv))
        monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", str(inv))
        return inv

    def test_init_requires_openresty_prefix(self, client):
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"}).json()
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
            "ssh_user": "jboss",
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

    def test_push_streams_events(self, client, test_db, gateway_inventory, monkeypatch):
        from app.services import relay_push

        # 空名单守卫要求区域有启用节点（openspec: relay-push-empty-whitelist-guard）
        _seed_region_nodes(test_db, enabled=1, disabled=0)

        def fake_run(**kw):
            assert kw.get("event_handler") is not None
            kw["event_handler"]({"stdout": "TASK [写入白名单 map]"})
            return {"rc": 0, "status": "successful"}

        monkeypatch.setattr(relay_push, "_run_ansible_push", fake_run)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config")
        assert resp.status_code == 200, resp.text
        assert "text/event-stream" in resp.headers["content-type"]
        events = _sse_events(resp.text)
        assert "TASK [写入白名单 map]" in [e["line"] for e in events if "line" in e]
        assert events[-1]["rc"] == 0

    # ── 空名单下发防护（openspec: relay-push-empty-whitelist-guard） ─────────
    def test_push_empty_region_rejected_409(self, client, test_db, gateway_inventory, monkeypatch):
        """0 启用节点时默认 409：detail 点名集群/禁用数并给出「改为启用」动作；不触发 ansible。"""
        from app.services import relay_push

        def _no_ansible(**kw):
            raise AssertionError("空名单拒绝时不得触发 ansible")

        monkeypatch.setattr(relay_push, "_run_ansible_push", _no_ansible)
        _seed_region_nodes(test_db, enabled=0, disabled=4)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config")
        assert resp.status_code == 409
        detail = resp.json()["detail"]
        assert "请先将节点状态改为「启用」" in detail
        import asyncio

        cluster_name = asyncio.run(test_db.get(Cluster, 1)).name
        assert f"「{cluster_name}」的 4 个节点均为禁用状态" in detail
        assert "确认空名单下发" in detail

    def test_push_empty_region_allow_empty_streams(self, client, test_db, gateway_inventory, monkeypatch):
        """显式 allow_empty=true 放行空名单下发（区域下线清空场景）。"""
        from app.services import relay_push

        def fake_run(**kw):
            kw["event_handler"]({"stdout": "TASK [写入白名单 map]"})
            return {"rc": 0, "status": "successful"}

        monkeypatch.setattr(relay_push, "_run_ansible_push", fake_run)
        _seed_region_nodes(test_db, enabled=0, disabled=4)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config",
                           json={"allow_empty": True})
        assert resp.status_code == 200, resp.text
        assert "text/event-stream" in resp.headers["content-type"]
        assert _sse_events(resp.text)[-1]["rc"] == 0

    def test_push_with_enabled_node_streams_without_flag(self, client, test_db, gateway_inventory, monkeypatch):
        """≥1 启用节点时不带 allow_empty 照常下发（禁用节点不进白名单，但不禁闸）。"""
        from app.services import relay_push

        def fake_run(**kw):
            kw["event_handler"]({"stdout": "TASK [写入白名单 map]"})
            return {"rc": 0, "status": "successful"}

        monkeypatch.setattr(relay_push, "_run_ansible_push", fake_run)
        _seed_region_nodes(test_db, enabled=1, disabled=1)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config")
        assert resp.status_code == 200, resp.text
        assert _sse_events(resp.text)[-1]["rc"] == 0

    def test_push_empty_region_without_clusters_detail(self, client, gateway_inventory, monkeypatch):
        """区域无挂接集群时的 detail 变体：提示先挂接集群并启用节点。"""
        from app.services import relay_push

        monkeypatch.setattr(relay_push, "_run_ansible_push",
                            lambda **kw: (_ for _ in ()).throw(AssertionError("不得触发 ansible")))
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config")
        assert resp.status_code == 409
        assert "没有挂接集群或启用节点" in resp.json()["detail"]

    # ── 下发快照（openspec: relay-push-drift-preview） ─────────
    def test_push_success_records_snapshot(self, client, test_db, gateway_inventory, monkeypatch):
        """push 终态成功 → 快照写入启用节点清单与时间；禁用节点不入快照。"""
        from app.services import relay_push

        def fake_run(**kw):
            kw["event_handler"]({"stdout": "TASK [写入白名单 map]"})
            return {"rc": 0, "status": "successful"}

        monkeypatch.setattr(relay_push, "_run_ansible_push", fake_run)
        _seed_region_nodes(test_db, enabled=2, disabled=1)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config")
        assert resp.status_code == 200, resp.text
        assert _sse_events(resp.text)[-1]["rc"] == 0
        row = _gateway_row(test_db, created["id"])
        assert row.last_pushed_at is not None
        assert sorted(json.loads(row.last_pushed_nodes)) == [
            "10.20.0.0:9180", "10.20.0.1:9180"]

    def test_push_failure_keeps_snapshot(self, client, test_db, gateway_inventory, monkeypatch):
        """push 终态失败（rc!=0）→ 快照保持原值。"""
        from app.services import relay_push

        def fake_run(**kw):
            kw["event_handler"]({"stdout": "TASK [写入白名单 map]"})
            return {"rc": 1, "status": "failed"}

        monkeypatch.setattr(relay_push, "_run_ansible_push", fake_run)
        _seed_region_nodes(test_db, enabled=1, disabled=0)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config")
        assert _sse_events(resp.text)[-1]["rc"] == 1
        row = _gateway_row(test_db, created["id"])
        assert row.last_pushed_at is None
        assert row.last_pushed_nodes is None

    def test_push_false_success_keeps_snapshot(self, client, test_db, gateway_inventory, monkeypatch):
        """rc=0 空匹配假成功（改判 failed）→ 不得写快照（AGENTS #21② 守卫联动）。"""
        from app.services import relay_push

        def fake_run(**kw):
            kw["event_handler"]({"stdout": "Could not match supplied host pattern: gateways_luju"})
            return {"rc": 0, "status": "successful"}

        monkeypatch.setattr(relay_push, "_run_ansible_push", fake_run)
        _seed_region_nodes(test_db, enabled=1, disabled=0)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config")
        final = _sse_events(resp.text)[-1]
        assert final["rc"] == 0 and final["status"] == "failed"
        row = _gateway_row(test_db, created["id"])
        assert row.last_pushed_at is None
        assert row.last_pushed_nodes is None

    def test_init_success_records_snapshot(self, client, test_db, gateway_inventory, monkeypatch):
        """init 终态成功也写快照（init 同样写白名单脚手架）；无节点时快照为空列表。"""
        from app.services import relay_init

        def fake_run(**kw):
            kw["event_handler"]({"stdout": "PLAY [初始化中继网关]"})
            return {"rc": 0, "status": "successful"}

        monkeypatch.setattr(relay_init, "_run_ansible_init", fake_run)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/init")
        assert resp.status_code == 200, resp.text
        assert _sse_events(resp.text)[-1]["rc"] == 0
        row = _gateway_row(test_db, created["id"])
        assert row.last_pushed_at is not None
        assert json.loads(row.last_pushed_nodes) == []

    def test_allow_empty_push_records_empty_snapshot(self, client, test_db, gateway_inventory, monkeypatch):
        """allow_empty 空名单下发成功 → 快照如实写 []（下次弹窗据此显示将移除全部）。"""
        from app.services import relay_push

        def fake_run(**kw):
            kw["event_handler"]({"stdout": "TASK [写入白名单 map]"})
            return {"rc": 0, "status": "successful"}

        monkeypatch.setattr(relay_push, "_run_ansible_push", fake_run)
        _seed_region_nodes(test_db, enabled=0, disabled=2)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.post(f"/api/v1/relay/gateways/{created['id']}/push-config",
                           json={"allow_empty": True})
        assert resp.status_code == 200, resp.text
        assert _sse_events(resp.text)[-1]["rc"] == 0
        row = _gateway_row(test_db, created["id"])
        assert row.last_pushed_at is not None
        assert json.loads(row.last_pushed_nodes) == []

    # ── 漂移预览回填（openspec: relay-push-drift-preview） ─────────
    def _seed_snapshot(self, test_db, gateway_id: int, nodes: list[str], at: datetime) -> None:
        import asyncio

        async def _seed():
            gw = await test_db.get(RelayGateway, gateway_id)
            gw.last_pushed_nodes = json.dumps(nodes)
            gw.last_pushed_at = at
            await test_db.commit()

        asyncio.run(_seed())

    def test_list_gateways_push_drift_null_when_never_pushed(self, client, test_db):
        """从未成功下发（快照为空）→ push_drift 为 null（区别于「一致」的空差集）。"""
        _seed_region_nodes(test_db, enabled=1, disabled=0)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        resp = client.get("/api/v1/relay/gateways")
        item = next(x for x in resp.json() if x["id"] == created["id"])
        assert item["push_drift"] is None
        assert item["last_pushed_at"] is None

    def test_list_gateways_push_drift_added_removed(self, client, test_db):
        """快照与当前启用集合差集：快照有现无 → removed；现有快照无 → added。"""
        _seed_region_nodes(test_db, enabled=2, disabled=0)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        self._seed_snapshot(test_db, created["id"],
                            ["10.20.0.0:9180", "10.99.9.9:9999"],
                            datetime(2026, 11, 4, 1, 2, 3))
        resp = client.get("/api/v1/relay/gateways")
        item = next(x for x in resp.json() if x["id"] == created["id"])
        assert item["push_drift"] == {
            "added": ["10.20.0.1:9180"], "removed": ["10.99.9.9:9999"]}
        assert item["last_pushed_at"] == "2026-11-04T01:02:03"

    def test_list_gateways_drift_empty_lists_when_identical(self, client, test_db):
        """快照与当前启用集合一致 → added/removed 均为空列表（非 null）。"""
        _seed_region_nodes(test_db, enabled=2, disabled=1)
        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "luju", "name": "路局A", "openresty_prefix": "/opt/nginx"}).json()
        self._seed_snapshot(test_db, created["id"],
                            ["10.20.0.0:9180", "10.20.0.1:9180"],
                            datetime(2026, 11, 4, 1, 2, 3))
        resp = client.get("/api/v1/relay/gateways")
        item = next(x for x in resp.json() if x["id"] == created["id"])
        assert item["push_drift"] == {"added": [], "removed": []}

    def test_list_gateways_reports_node_counts(self, client, test_db):
        """列表逐区域回填 enabled_node_count / total_node_count（无挂接区域为 0/0）。"""
        import asyncio

        from sqlalchemy import select

        async def _seed():
            c1 = await test_db.get(Cluster, 1)
            c1.region_code = "luju"
            test_db.add(Node(cluster_id=1, ip="10.20.0.1", ssh_port=22, management_port=9180,
                             edge_path="/opt/edge", status=1))
            test_db.add(Node(cluster_id=1, ip="10.30.0.1", ssh_port=22, management_port=9180,
                             edge_path="/opt/edge", status=0))
            c2 = Cluster(name="c2", status=1, region_code="luju")
            test_db.add(c2)
            await test_db.flush()  # 取自增 id，不硬编码（同会话种子数据可能已占用 id=2）
            test_db.add(Node(cluster_id=c2.id, ip="10.20.0.2", ssh_port=22, management_port=9180,
                             edge_path="/opt/edge", status=1))
            await test_db.commit()

        asyncio.run(_seed())
        client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"})
        client.post("/api/v1/relay/gateways", json={"code": "tianjin", "name": "路局B", "ssh_user": "jboss"})
        resp = client.get("/api/v1/relay/gateways")
        assert resp.status_code == 200
        rows = {r["code"]: r for r in resp.json()}
        assert rows["luju"]["enabled_node_count"] == 2
        assert rows["luju"]["total_node_count"] == 3
        assert rows["tianjin"]["enabled_node_count"] == 0
        assert rows["tianjin"]["total_node_count"] == 0

    def test_busy_region_returns_409(self, client, gateway_inventory):
        from app.api.v1 import relay

        created = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
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
            "ssh_user": "jboss",
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
            "ssh_user": "jboss",
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
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"}).json()
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


class TestRelayGatewayFieldFormat:
    """路由字段格式硬校验（openspec: relay-region-ux-optimization D4）：

    http_base_url 须匹配 http(s)://host[:port]（不含路径）；ssh_jump 须匹配
    账号@主机[:端口]；openresty_prefix 须为以 / 开头的绝对路径。strip 先于格式校验。
    """

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
            await test_db.commit()
        asyncio.run(_seed())

        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            yield c
        app.dependency_overrides.clear()

    @pytest.mark.parametrize("bad", [
        "10.10.1.1:8443",  # 漏协议
        "ftp://10.10.1.1:8443",  # 错协议
        "http://10.10.1.1:8443/",  # 带尾斜杠路径
        "http://10.10.1.1:8443/api",  # 带路径
    ])
    def test_create_http_base_url_bad_format_rejected(self, client, bad):
        resp = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "x", "http_base_url": bad, "ssh_user": "jboss"})
        assert resp.status_code in (400, 422), resp.text
        assert FORMAT_MSG_HTTP in _detail_text(resp), resp.text

    @pytest.mark.parametrize("good", ["http://10.10.1.1:8443", "https://gw.example.com", "http://192.168.0.13"])
    def test_create_http_base_url_good_passes(self, client, good):
        resp = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "x", "http_base_url": good, "ssh_user": "jboss"})
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["http_base_url"] == good

    @pytest.mark.parametrize("bad", ["10.10.1.1:22", "tunnel@", "@10.10.1.1"])
    def test_create_ssh_jump_bad_format_rejected(self, client, bad):
        resp = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "x", "ssh_jump": bad, "ssh_user": "jboss"})
        assert resp.status_code in (400, 422), resp.text
        assert FORMAT_MSG_SSH in _detail_text(resp), resp.text

    def test_create_ssh_jump_without_port_passes(self, client):
        resp = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "x", "ssh_jump": "tunnel@10.10.1.1", "ssh_user": "jboss"})
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["ssh_jump"] == "tunnel@10.10.1.1"

    @pytest.mark.parametrize("bad", ["work/openresty", " work/openresty", "C:/openresty"])
    def test_create_openresty_prefix_not_absolute_rejected(self, client, bad):
        resp = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "x", "openresty_prefix": bad, "ssh_user": "jboss"})
        assert resp.status_code in (400, 422), resp.text
        assert FORMAT_MSG_PREFIX in _detail_text(resp), resp.text

    @pytest.mark.parametrize("field, bad", [
        ("http_base_url", "10.10.1.1:8443"),
        ("ssh_jump", "10.10.1.1:22"),
        ("openresty_prefix", "work/openresty"),
    ])
    def test_update_same_rules(self, client, field, bad):
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "x", "ssh_user": "jboss"}).json()
        resp = client.put(f"/api/v1/relay/gateways/{created['id']}", json={field: bad})
        assert resp.status_code in (400, 422), resp.text

    def test_update_good_values_pass(self, client):
        created = client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "x", "ssh_user": "jboss"}).json()
        resp = client.put(f"/api/v1/relay/gateways/{created['id']}", json={
            "http_base_url": "http://10.10.1.1:8443",
            "ssh_jump": "tunnel@10.10.1.1",
            "openresty_prefix": "/work/openresty/nginx",
        })
        assert resp.status_code == 200, resp.text

    def test_strip_runs_before_format_validation(self, client):
        """既有 strip 行为保留：带首尾空白的合法值 strip 后通过格式校验。"""
        resp = client.post("/api/v1/relay/gateways", json={
            "ssh_user": "jboss",
            "code": "kjc", "name": "路局K",
            "http_base_url": " https://192.168.0.13:8443 ",
            "openresty_prefix": " /work/jboss/tunnel/openresty-1.21.4.1/nginx ",
        })
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["http_base_url"] == "https://192.168.0.13:8443"
        assert resp.json()["openresty_prefix"] == "/work/jboss/tunnel/openresty-1.21.4.1/nginx"


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

    def test_list_regions_flags_missing_inventory_group(self, client, monkeypatch, tmp_path):
        """列表暴露清单漂移：区域已注册但 inventory 缺组 → inventory_group_missing=True。"""
        from app.services import relay_push

        inv = tmp_path / "gateways"
        inv.write_text("gateways_luju:\n  hosts:\n    10.10.1.1: {}\n", encoding="utf-8")
        monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", str(inv))
        client.post("/api/v1/relay/gateways", json={"code": "luju", "name": "路局A", "ssh_user": "jboss"})
        client.post("/api/v1/relay/gateways", json={"code": "tianjin", "name": "路局B", "ssh_user": "jboss"})
        rows = {r["code"]: r for r in client.get("/api/v1/relay/gateways").json()}
        assert rows["luju"]["inventory_group_missing"] is False
        assert rows["tianjin"]["inventory_group_missing"] is True

    def test_create_and_update_strip_whitespace_on_path_fields(self, client):
        """路径/URL 类字段保存前 strip：前导空格曾让 init 的 nginx 探测静默失败（2026-10-03 kjc 实发）。"""
        created = client.post(
            "/api/v1/relay/gateways",
            json={
                "code": "kjc",
                "name": "路局K",
                "ssh_user": "jboss",
                "openresty_prefix": " /work/jboss/tunnel/openresty-1.21.4.1/nginx ",
                "http_base_url": " https://192.168.0.13:8443 ",
            },
        ).json()
        assert created["openresty_prefix"] == "/work/jboss/tunnel/openresty-1.21.4.1/nginx"
        assert created["http_base_url"] == "https://192.168.0.13:8443"

        updated = client.put(
            f"/api/v1/relay/gateways/{created['id']}",
            json={"ssh_jump": " jboss@192.168.0.13 "},
        ).json()
        assert updated["ssh_jump"] == "jboss@192.168.0.13"
