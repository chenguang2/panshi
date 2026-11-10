"""拓扑数据端点测试（openspec: relay-region-topology-view 批次一 1.1）。

覆盖：未认证 401 / 无权限 403 / feature 关闸 404、whitelist_state 四态
（服务端单点派生，design D3）、快照 NULL 兼容、直连区域（两腿空）、
detachable 全集、悬空区域码、空账号区域、响应形状（design D4，口令永不回传）。
"""
import asyncio
import json
from datetime import datetime

import pytest
import yaml

from app.main import app
from app.core.database import get_db
from app.core.security import hash_password
from app.models.cluster import Cluster, Node
from app.models.relay import RelayGateway
from app.models.user import User
from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

TOPOLOGY_URL = "/api/v1/relay/topology"
FEATURE_OFF_MSG = "中继网关功能未启用"


def _seed_admin(test_db) -> None:
    async def _seed():
        if await test_db.get(User, 1) is None:
            test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                             role="admin", status=1))
        await test_db.commit()
    asyncio.run(_seed())


@pytest.fixture
def client(test_db, test_db_factory):
    """已鉴权客户端（种子 admin id=1），get_db 指向隔离库（范式同 test_relay_gateway_api）。"""
    async def override_get_db():
        async with test_db_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    _seed_admin(test_db)
    with isolated_app_lifespan(), AuthedTestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _point_features_at(monkeypatch, path):
    """让 feature_enabled 读取指定 yaml（范式同 test_relay_feature_gate）。"""
    import app.core.features as fmod

    fmod._features = None
    fmod._features_mtime = 0.0
    monkeypatch.setattr(fmod, "_FEATURES_PATH", path)


@pytest.fixture()
def relay_feature_off(monkeypatch, tmp_path):
    cfg = tmp_path / "features.yaml"
    cfg.write_text(yaml.dump({"features": {"relay_gateway": False}}), encoding="utf-8")
    _point_features_at(monkeypatch, cfg)
    yield
    import app.core.features as fmod

    fmod._features = None
    fmod._features_mtime = 0.0


def _add_gateway(test_db, **kw) -> None:
    async def _seed():
        test_db.add(RelayGateway(**kw))
        await test_db.commit()
    asyncio.run(_seed())


def _bind_cluster(test_db, cluster_id: int, region_code: str | None,
                  display_name: str | None = None) -> None:
    """conftest 已种子集群 1/2/3（seed-cluster-{id}），此处只改挂接区域与展示名。"""
    async def _seed():
        c = await test_db.get(Cluster, cluster_id)
        c.region_code = region_code
        if display_name is not None:
            c.display_name = display_name
        await test_db.commit()
    asyncio.run(_seed())


def _add_nodes(test_db, cluster_id: int, specs: list[tuple[str, int]]) -> None:
    """specs: [(ip, status)]，管理端口统一 9180。"""
    async def _seed():
        for ip, status in specs:
            test_db.add(Node(cluster_id=cluster_id, ip=ip, ssh_port=22,
                             management_port=9180, edge_path="/opt/edge", status=status))
        await test_db.commit()
    asyncio.run(_seed())


def _region_by_code(body: dict, code: str) -> dict:
    return next(r for r in body["regions"] if r["code"] == code)


class TestRelayTopologyAuth:
    def test_unauthenticated_rejected(self, test_db, test_db_factory):
        """未认证 → 401（router 级依赖自动继承；GET 只读，#19 无需补采样）。"""
        from fastapi.testclient import TestClient

        async def override_get_db():
            async with test_db_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        _seed_admin(test_db)
        try:
            with isolated_app_lifespan(), TestClient(app) as bare:
                resp = bare.get(TOPOLOGY_URL)
                assert resp.status_code == 401, resp.text
                assert "未认证" in resp.json()["detail"]
        finally:
            app.dependency_overrides.clear()

    def test_user_without_permission_403(self, client, test_db):
        """无 relay_gateway 权限的普通用户 → 403（权限依赖在 feature 总闸之前解析）。"""
        async def _seed():
            test_db.add(User(username="plain_user", password_hash=hash_password("password123"),
                             role="user", status=1))
            await test_db.commit()
        asyncio.run(_seed())
        login = client.post("/api/v1/auth/login",
                            json={"username": "plain_user", "password": "password123"})
        assert login.status_code == 200, login.text
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        resp = client.get(TOPOLOGY_URL, headers=headers)
        assert resp.status_code == 403, resp.text

    def test_feature_off_404(self, client, relay_feature_off):
        """relay_gateway 关闸 → 404（与既有 relay 路由总闸语义一致）。"""
        resp = client.get(TOPOLOGY_URL)
        assert resp.status_code == 404, resp.text
        assert resp.json()["detail"] == FEATURE_OFF_MSG


class TestRelayTopologyData:
    def test_whitelist_state_four_states(self, client, test_db):
        """D3 四态派生：启用在快照=synced / 启用不在=pending_add / 停用在=pending_remove / 停用不在=off。

        快照与 list_gateways 的 push_drift 同源（last_pushed_nodes）。
        """
        _add_gateway(test_db, code="luju", name="路局A",
                     http_base_url="http://10.10.1.1:8443", ssh_jump="tunnel@10.10.1.1",
                     ssh_user="jboss", status="enabled",
                     last_pushed_nodes=json.dumps(["10.20.0.1:9180", "10.30.0.9:9180"]),
                     last_pushed_at=datetime(2026, 11, 4, 1, 2, 3))
        _bind_cluster(test_db, 1, "luju", "集群一")
        _add_nodes(test_db, 1, [
            ("10.20.0.1", 1),   # 启用 + 在快照 → synced
            ("10.20.0.2", 1),   # 启用 + 不在快照 → pending_add
            ("10.30.0.9", 0),   # 停用 + 在快照 → pending_remove
            ("10.30.0.8", 0),   # 停用 + 不在快照 → off
        ])
        resp = client.get(TOPOLOGY_URL)
        assert resp.status_code == 200, resp.text
        region = _region_by_code(resp.json(), "luju")
        assert region["last_pushed_at"] == "2026-11-04T01:02:03"
        states = {n["ip"]: n["whitelist_state"] for n in region["clusters"][0]["nodes"]}
        assert states == {
            "10.20.0.1": "synced",
            "10.20.0.2": "pending_add",
            "10.30.0.9": "pending_remove",
            "10.30.0.8": "off",
        }

    def test_snapshot_null_enabled_pending_add_disabled_off(self, client, test_db):
        """快照 NULL（从未成功下发）：enabled → pending_add、disabled → off。"""
        _add_gateway(test_db, code="nosnap", name="未下发局",
                     ssh_jump="tunnel@10.10.1.1", ssh_user="jboss")
        _bind_cluster(test_db, 1, "nosnap")
        _add_nodes(test_db, 1, [("10.40.0.1", 1), ("10.40.0.2", 0)])
        resp = client.get(TOPOLOGY_URL)
        assert resp.status_code == 200, resp.text
        region = _region_by_code(resp.json(), "nosnap")
        assert region["last_pushed_at"] is None
        states = {n["ip"]: n["whitelist_state"] for n in region["clusters"][0]["nodes"]}
        assert states == {"10.40.0.1": "pending_add", "10.40.0.2": "off"}

    def test_snapshot_bad_json_falls_back_to_null_semantics(self, client, test_db):
        """快照坏 JSON → 与 NULL 同语义（诚实「无快照」态，同 _parse_snapshot 防御）。"""
        _add_gateway(test_db, code="badsnap", name="坏快照局",
                     ssh_jump="tunnel@10.10.1.1", ssh_user="jboss",
                     last_pushed_nodes="not-json")
        _bind_cluster(test_db, 1, "badsnap")
        _add_nodes(test_db, 1, [("10.60.0.1", 1)])
        resp = client.get(TOPOLOGY_URL)
        region = _region_by_code(resp.json(), "badsnap")
        assert region["clusters"][0]["nodes"][0]["whitelist_state"] == "pending_add"

    def test_direct_region_without_legs_returns(self, client, test_db):
        """直连区域（两腿均空）正常返回：腿字段为 null、无挂接集群为空列表。"""
        _add_gateway(test_db, code="wuqing", name="武清直连")
        resp = client.get(TOPOLOGY_URL)
        assert resp.status_code == 200, resp.text
        region = _region_by_code(resp.json(), "wuqing")
        assert region["http_base_url"] is None
        assert region["ssh_jump"] is None
        assert region["ssh_user"] is None
        assert region["clusters"] == []

    def test_region_without_ssh_user_returns(self, client, test_db):
        """空账号区域正常返回（D8 中间态）：ssh_user 为 null，节点明细照常派生。

        前端阶段机 init-blocked 判定消费 ssh_user 字段（口令永不回传）。
        """
        _add_gateway(test_db, code="noacc", name="缺账号局",
                     ssh_jump="tunnel@10.10.1.1", openresty_prefix="/opt/nginx")
        _bind_cluster(test_db, 1, "noacc")
        _add_nodes(test_db, 1, [("10.50.0.1", 1)])
        resp = client.get(TOPOLOGY_URL)
        assert resp.status_code == 200, resp.text
        region = _region_by_code(resp.json(), "noacc")
        assert region["ssh_user"] is None
        assert region["ssh_jump"] == "tunnel@10.10.1.1"
        node = region["clusters"][0]["nodes"][0]
        assert node == {"ip": "10.50.0.1", "management_port": 9180, "status": 1,
                        "whitelist_state": "pending_add"}

    def test_detachable_lists_all_clusters(self, client, test_db):
        """detachable = 全部集群轻量引用（含未挂接/悬空码集群），前端按区域自行过滤。"""
        _add_gateway(test_db, code="luju", name="路局A",
                     ssh_jump="tunnel@10.10.1.1", ssh_user="jboss")
        _bind_cluster(test_db, 1, "luju", "集群一")
        _bind_cluster(test_db, 2, None)
        _bind_cluster(test_db, 3, "ghost")
        resp = client.get(TOPOLOGY_URL)
        assert resp.status_code == 200, resp.text
        detachable = resp.json()["detachable"]
        assert [c["id"] for c in detachable] == [1, 2, 3]
        by_id = {c["id"]: c for c in detachable}
        assert by_id[1] == {"id": 1, "name": "seed-cluster-1",
                            "display_name": "集群一", "region_code": "luju"}
        assert by_id[2]["region_code"] is None
        assert by_id[3]["region_code"] == "ghost"

    def test_unregistered_bound_codes_dedup_sorted(self, client, test_db):
        """集群挂接但无注册行的区域码：去重 + 排序；无注册行时 regions 为空。"""
        _bind_cluster(test_db, 1, "ghost")
        _bind_cluster(test_db, 2, "aaghost")
        _bind_cluster(test_db, 3, "ghost")  # 与集群 1 同码 → 去重
        resp = client.get(TOPOLOGY_URL)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["unregistered_bound_codes"] == ["aaghost", "ghost"]
        assert body["regions"] == []

    def test_regions_ordered_by_id(self, client):
        """区域排序 order_by id（与 list_gateways 一致），非按 code 字典序。"""
        assert client.post("/api/v1/relay/gateways", json={"code": "zz", "name": "后建"}).status_code in (200, 201)
        assert client.post("/api/v1/relay/gateways", json={"code": "aa", "name": "先码"}).status_code in (200, 201)
        resp = client.get(TOPOLOGY_URL)
        assert [r["code"] for r in resp.json()["regions"]] == ["zz", "aa"]

    def test_response_shape_no_password(self, client, test_db):
        """D4 形状钉死：区域/集群/节点/detachable 键集合精确；ssh_password 永不出现在响应。"""
        _add_gateway(test_db, code="luju", name="路局A", ssh_jump="tunnel@10.10.1.1",
                     ssh_user="jboss", ssh_port=22,
                     last_pushed_nodes=json.dumps(["10.20.0.1:9180"]),
                     last_pushed_at=datetime(2026, 11, 4, 1, 2, 3))
        _bind_cluster(test_db, 1, "luju")
        _add_nodes(test_db, 1, [("10.20.0.1", 1)])
        resp = client.get(TOPOLOGY_URL)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        region = body["regions"][0]
        assert set(region.keys()) == {
            "id", "code", "name", "status", "http_base_url", "ssh_jump", "ssh_user",
            "ssh_port", "openresty_prefix", "last_pushed_at", "clusters",
        }
        assert "ssh_password" not in region
        assert set(region["clusters"][0].keys()) == {"id", "name", "display_name", "nodes"}
        assert set(region["clusters"][0]["nodes"][0].keys()) == {
            "ip", "management_port", "status", "whitelist_state"}
        assert set(body["detachable"][0].keys()) == {
            "id", "name", "display_name", "region_code"}
