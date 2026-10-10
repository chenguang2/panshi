"""概览页数据契约测试（openspec: overview-page-ux 批次 1；restricted-data-scoping 批次 1）。

- GET /dashboard/stats：响应含 nodes_online（status==1 的节点数）与
  nodes_untested（status==1 且 status_detail IS NULL 的节点数）。
- GET /dashboard/recent-routes：每项含 created_at（naive UTC isoformat，
  与 Route.created_at 一致，无时区后缀）。
- 非管理员仅见被分配集群（sys_user_cluster）：stats 集群域计数与
  recent-routes 均按分配过滤；users 计数保持全局。
"""
import asyncio
from datetime import datetime

import pytest

from app.main import app
from app.core.database import get_db
from app.core.security import hash_password
from app.models.user import User, UserCluster
from app.models.cluster import Cluster, Node, Route, Upstream
from tests.api_helpers import AuthedTestClient, auth_headers_for, isolated_app_lifespan


async def _seed_dashboard_data(db):
    """三类节点 + 两条带显式 created_at 的路由（身份键 ip+service_port 全不重复）。"""
    if await db.get(User, 1) is None:
        db.add(User(id=1, username="dashboard_user", password_hash=hash_password("password123"),
                    role="admin", status=1))
    if await db.get(Cluster, 1) is None:
        db.add(Cluster(id=1, name="dash-cluster", status=1))

    db.add_all([
        # 失败节点：status=0 → 不计入 online/untested
        Node(cluster_id=1, ip="10.0.0.1", service_port=80, edge_path="/usr/local/openresty",
             status=0, status_detail='{"ok": false}'),
        # 未测试节点：status=1 且 status_detail IS NULL → online=是, untested=是
        Node(cluster_id=1, ip="10.0.0.2", service_port=80, edge_path="/usr/local/openresty",
             status=1, status_detail=None),
        # 已测试在线节点：status=1 且 status_detail 非空 → online=是, untested=否
        Node(cluster_id=1, ip="10.0.0.3", service_port=80, edge_path="/usr/local/openresty",
             status=1, status_detail='{"ok": true}'),
    ])

    db.add_all([
        Route(cluster_id=1, name="route-old", uri="/old/*", created_at=datetime(2026, 1, 1, 8, 0, 0)),
        Route(cluster_id=1, name="route-new", uri="/new/*", created_at=datetime(2026, 1, 2, 12, 30, 45)),
    ])
    await db.commit()


@pytest.fixture
def client(test_db, test_db_factory):
    async def override_get_db():
        async with test_db_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    asyncio.run(_seed_dashboard_data(test_db))

    with isolated_app_lifespan(), AuthedTestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class TestDashboardStats:
    def test_stats_contain_node_online_and_untested_counts(self, client):
        resp = client.get("/api/v1/dashboard/stats")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # 三个节点：1 个失败（status=0）+ 1 个未测试（status=1, detail NULL）+ 1 个已测试（status=1, detail 非空）
        assert body["nodes"] == 3
        assert body["nodes_online"] == 2
        assert body["nodes_untested"] == 1


class TestRecentRoutes:
    def test_recent_routes_items_contain_created_at(self, client):
        resp = client.get("/api/v1/dashboard/recent-routes")
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert len(items) == 2

        # 按 created_at 倒序：最新的在前
        assert [it["name"] for it in items] == ["route-new", "route-old"]

        # naive UTC isoformat 字符串比较（无时区后缀），与 Route.created_at 一致
        by_name = {it["name"]: it["created_at"] for it in items}
        assert by_name["route-new"] == "2026-01-02T12:30:45"
        assert by_name["route-old"] == "2026-01-01T08:00:00"


# ---------------------------------------------------------------------------
# 受限用户可见性（openspec: restricted-data-scoping 批次 1）
# 非管理员仅见被分配集群（sys_user_cluster / UserCluster），与既有 9 个集群域
# 端点同一契约。三对照：① 零分配 → 集群域全 0 / recent-routes 空 / users 全局；
# ② 部分分配 A/B → 不含 C 的数据；③ 管理员全量口径不变（上方既有用例原样绿）。
# ---------------------------------------------------------------------------
async def _seed_restricted_scenarios(db):
    """集群 A/B/C（id 1/2/3，与 conftest 种子共存）各带节点/上游/路由，
    受限用户 id=2 零分配、id=3 分配 A/B（UserCluster 行）。

    每用例独立内存库（test_db_factory function 级），与既有用例的
    _seed_dashboard_data 种子互不污染，绝对计数断言安全。
    """
    if await db.get(User, 1) is None:
        db.add(User(id=1, username="dashboard_user", password_hash=hash_password("password123"),
                    role="admin", status=1))
    for cid, name in ((1, "cluster-a"), (2, "cluster-b"), (3, "cluster-c")):
        if await db.get(Cluster, cid) is None:
            db.add(Cluster(id=cid, name=name, status=1))

    db.add_all([
        User(id=2, username="restricted_zero", password_hash=hash_password("password123"),
             role="user", status=1),
        User(id=3, username="restricted_ab", password_hash=hash_password("password123"),
             role="user", status=1),
    ])

    # 每集群 2 节点（身份键 ip+service_port 全不重复）：
    # A: 在线已测试 + 失败；B: 在线已测试 + 在线未测试；C: 在线已测试 + 失败
    node_specs = {
        1: [("10.1.0.1", 1, '{"ok": true}'), ("10.1.0.2", 0, '{"ok": false}')],
        2: [("10.2.0.1", 1, '{"ok": true}'), ("10.2.0.2", 1, None)],
        3: [("10.3.0.1", 1, '{"ok": true}'), ("10.3.0.2", 0, '{"ok": false}')],
    }
    db.add_all([
        Node(cluster_id=cid, ip=ip, service_port=80, edge_path="/usr/local/openresty",
             status=status, status_detail=detail)
        for cid, entries in node_specs.items()
        for ip, status, detail in entries
    ])

    db.add_all([
        Upstream(cluster_id=1, name="up-a"),
        Upstream(cluster_id=2, name="up-b"),
        Upstream(cluster_id=3, name="up-c"),
        Route(cluster_id=1, name="route-a-1", uri="/a1/*", created_at=datetime(2026, 2, 1, 8, 0, 0)),
        Route(cluster_id=1, name="route-a-2", uri="/a2/*", created_at=datetime(2026, 2, 1, 9, 0, 0)),
        Route(cluster_id=2, name="route-b-1", uri="/b1/*", created_at=datetime(2026, 2, 2, 8, 0, 0)),
        # C 的路由 created_at 全局最新：未过滤时会排在 recent-routes 首位
        Route(cluster_id=3, name="route-c-secret", uri="/c/*", created_at=datetime(2026, 2, 3, 8, 0, 0)),
        # 仅用户 3 有分配：A/B（id 1/2）
        UserCluster(user_id=3, cluster_id=1),
        UserCluster(user_id=3, cluster_id=2),
    ])
    await db.commit()


@pytest.fixture
def restricted_client_factory(test_db, test_db_factory):
    """受限用户场景客户端工厂：make(user_id) 返回以该用户身份请求的客户端。

    同一种子上 3 个身份：1=admin（全量对照）、2=零分配、3=分配 A/B。
    """
    async def override_get_db():
        async with test_db_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    asyncio.run(_seed_restricted_scenarios(test_db))

    def make(user_id: int) -> AuthedTestClient:
        return AuthedTestClient(app, headers=auth_headers_for(user_id))

    with isolated_app_lifespan():
        yield make
    app.dependency_overrides.clear()


class TestRestrictedVisibility:
    def test_zero_allocation_stats_all_zero_but_users_global(self, restricted_client_factory):
        c = restricted_client_factory(2)  # 零分配受限用户
        resp = c.get("/api/v1/dashboard/stats")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # 库里实有 3 集群 / 6 节点 / 3 上游 / 4 路由，但该用户无任何分配 → 集群域全 0
        assert body["clusters"] == 0
        assert body["nodes"] == 0
        assert body["nodes_online"] == 0
        assert body["nodes_untested"] == 0
        assert body["upstreams"] == 0
        assert body["routes"] == 0
        assert body["plugin_configs"] == 0
        assert body["global_rules"] == 0
        assert body["static_resources"] == 0
        assert body["plugin_metadata"] == 0
        # users 保持全局值（有意行为：用户总数不随集群分配过滤）
        assert body["users"] == 3

    def test_zero_allocation_recent_routes_empty(self, restricted_client_factory):
        c = restricted_client_factory(2)
        resp = c.get("/api/v1/dashboard/recent-routes")
        assert resp.status_code == 200, resp.text
        assert resp.json()["items"] == []

    def test_partial_allocation_stats_excludes_unassigned_cluster(self, restricted_client_factory):
        c = restricted_client_factory(3)  # 仅分配 A/B（id 1/2）
        resp = c.get("/api/v1/dashboard/stats")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # A/B 合计：2 集群 / 4 节点（3 在线、1 未测试）/ 2 上游 / 3 路由；C 一律不计入
        assert body["clusters"] == 2
        assert body["nodes"] == 4
        assert body["nodes_online"] == 3
        assert body["nodes_untested"] == 1
        assert body["upstreams"] == 2
        assert body["routes"] == 3
        # users 仍为全局值
        assert body["users"] == 3

    def test_partial_allocation_recent_routes_excludes_unassigned(self, restricted_client_factory):
        c = restricted_client_factory(3)
        resp = c.get("/api/v1/dashboard/recent-routes")
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        names = [it["name"] for it in items]
        # 仅 A/B 的路由，按 created_at 倒序；C 的路由（全局最新）不可见
        assert names == ["route-b-1", "route-a-2", "route-a-1"]
        assert "route-c-secret" not in names

    def test_admin_sees_global_scope_on_same_seed(self, restricted_client_factory):
        """对照 ③：admin 身份在同一种子上全量口径（既有 3 用例为另一回归守卫）。"""
        c = restricted_client_factory(1)
        resp = c.get("/api/v1/dashboard/stats")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["clusters"] == 3
        assert body["nodes"] == 6
        assert body["nodes_online"] == 4
        assert body["nodes_untested"] == 1
        assert body["upstreams"] == 3
        assert body["routes"] == 4
        assert body["users"] == 3
