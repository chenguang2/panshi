"""集群/节点筛选（metrics-cluster-node-filter）。

覆盖：
- parse_filter 纯解析（三形态 + 非法值 ValueError）
- 6 端点 filter 参数接线：ip 集合解析（含禁用节点）、SQL 参数化注入、
  失效集群 warning 回退、unmanaged 差集、无 filter 行为不变（回归）
- summary 特例：仅 connectionStates 过滤，summary 值与 source_ok 不随筛选
- time-comparison 逐分支：day/week 的全部 WHERE 都带 ips（漏一处即静默不生效）
"""
import pytest
from unittest.mock import patch

from app.services.metrics_service import parse_filter


CLUSTER_NODES = [
    ("10.1.1.1", 1),
    ("10.1.1.2", 0),  # 禁用节点：采集端不一定停报，集群筛选必须包含（design D2）
]

CAPTURED: list[tuple[str, dict]] = []


def capture_query(default_rows=None):
    """execute_query 捕获桩：记录 (sql, params) 并返回固定行。"""
    def _fake(sql, params=None):
        CAPTURED.append((sql, params or {}))
        return default_rows or []
    return _fake


def calls_with_ips():
    """带 ips 键的捕获调用（含空集——空差集是合法语义，不能用真值判断过滤）。"""
    return [(sql, p) for sql, p in CAPTURED if "ips" in p]


async def seed_nodes(session):
    """在隔离库种专用集群 + 两节点（一个禁用），返回集群 id。"""
    from app.models.cluster import Cluster, Node
    cluster = Cluster(name="filter-cluster")
    session.add(cluster)
    await session.commit()
    await session.refresh(cluster)
    for ip, status in CLUSTER_NODES:
        session.add(Node(cluster_id=cluster.id, ip=ip, status=status, edge_path="/usr/local/openresty", service_port=80, management_port=9180))
    await session.commit()
    return cluster.id


NODE_HEALTH_ROWS = [("10.1.1.1", 1.0, "2026-11-02 10:00:00", 1793604000)]
ROUTE_ROWS = [("route-a", "/api/x", 12.5, 100, 5)]


class TestParseFilter:
    def test_none_returns_none(self):
        assert parse_filter(None) is None
        assert parse_filter("") is None

    def test_cluster_form(self):
        assert parse_filter("cluster:3") == ("cluster", "3")

    def test_node_form(self):
        assert parse_filter("node:192.168.1.1") == ("node", "192.168.1.1")

    def test_unmanaged_form(self):
        assert parse_filter("unmanaged") == ("unmanaged", "")

    @pytest.mark.parametrize("bad", ["node:abc", "cluster:abc", "foo", "cluster:", "node:"])
    def test_invalid_raises(self, bad):
        with pytest.raises(ValueError):
            parse_filter(bad)


@pytest.mark.asyncio
class TestEndpointFilter:
    @pytest.fixture(autouse=True)
    def _reset_capture(self):
        CAPTURED.clear()
        yield
        CAPTURED.clear()

    async def test_cluster_filter_passes_node_ips_including_disabled(self, async_authed_client, isolated_session):
        async with isolated_session() as session:
            cluster_id = await seed_nodes(session)
        with patch("app.services.metrics_service.execute_query", capture_query(NODE_HEALTH_ROWS)):
            resp = await async_authed_client.get("/api/v1/metrics/node-health", params={"filter": f"cluster:{cluster_id}"})
        assert resp.status_code == 200
        assert resp.json()["data"][0]["node_ip"] == "10.1.1.1"
        ips_calls = calls_with_ips()
        assert len(ips_calls) == 1
        assert sorted(ips_calls[0][1]["ips"]) == ["10.1.1.1", "10.1.1.2"]

    async def test_node_filter_single_ip(self, async_authed_client, isolated_session):
        async with isolated_session() as session:
            await seed_nodes(session)
        with patch("app.services.metrics_service.execute_query", capture_query(NODE_HEALTH_ROWS)):
            await async_authed_client.get("/api/v1/metrics/node-health", params={"health_type": "status", "filter": "node:10.1.1.1"})
        assert calls_with_ips()[0][1]["ips"] == ["10.1.1.1"]

    async def test_unmanaged_empty_difference_returns_empty_data(self, async_authed_client, isolated_session):
        """unmanaged 差集为空 → 返回空数据（诚实空态），绝不能静默放大成全站视角。

        实机验收抓到的真 bug：空列表 falsy 走了「不过滤」分支（2026-11-02）。
        """
        async with isolated_session() as session:
            await seed_nodes(session)  # 平台节点 10.1.1.1 / 10.1.1.2

        def fake(sql, params=None):
            CAPTURED.append((sql, params or {}))
            if "DISTINCT Attributes['ip']" in sql:
                return [("10.1.1.1",), ("10.1.1.2",)]  # 近期上报全部已纳管 → 差集为空
            return NODE_HEALTH_ROWS

        with patch("app.services.metrics_service.execute_query", fake), \
             patch("app.api.v1.metrics.execute_query", fake):
            resp = await async_authed_client.get("/api/v1/metrics/node-health", params={"filter": "unmanaged"})
        assert resp.status_code == 200
        # 空差集：主查询必须带 ips=[] 的 SQL 过滤（而非静默放大成全站查询）
        ips_calls = calls_with_ips()
        assert ips_calls and ips_calls[0][1]["ips"] == []
        assert "Attributes['ip'] IN" in ips_calls[0][0]

    async def test_unmanaged_is_recent_minus_platform(self, async_authed_client, isolated_session):
        async with isolated_session() as session:
            await seed_nodes(session)

        # resolver 的 execute_query 按值导入自 clickhouse_client（metrics.py 顶部 import），
        # 两个命名空间都要 patch（AGENTS #43：patch 其源模块，导入方命名空间无效）
        def fake(sql, params=None):
            CAPTURED.append((sql, params or {}))
            if "DISTINCT Attributes['ip']" in sql:
                return [("10.1.1.1",), ("10.9.9.9",), ("10.8.8.8",)]
            return NODE_HEALTH_ROWS

        with patch("app.services.metrics_service.execute_query", fake), \
             patch("app.api.v1.metrics.execute_query", fake):
            await async_authed_client.get("/api/v1/metrics/node-health", params={"filter": "unmanaged"})
        assert sorted(calls_with_ips()[0][1]["ips"]) == ["10.8.8.8", "10.9.9.9"]

    async def test_nonexistent_cluster_falls_back_with_warning(self, async_authed_client, isolated_session):
        async with isolated_session() as session:
            await seed_nodes(session)
        with patch("app.services.metrics_service.execute_query", capture_query(NODE_HEALTH_ROWS)):
            resp = await async_authed_client.get("/api/v1/metrics/node-health", params={"filter": "cluster:42"})
        assert resp.status_code == 200
        assert "warning" in resp.json()
        assert calls_with_ips() == []  # 全局查询，不带 ips

    @pytest.mark.parametrize("bad", ["node:abc", "foo", "cluster:"])
    async def test_invalid_filter_400_chinese(self, async_authed_client, bad):
        resp = await async_authed_client.get("/api/v1/metrics/node-health", params={"filter": bad})
        assert resp.status_code == 400
        assert "筛选参数无效" in resp.json()["detail"]

    async def test_no_filter_keeps_legacy_behavior(self, async_authed_client):
        """回归：无 filter 时任何查询都不带 ips，行为与现状完全一致。"""
        with patch("app.services.metrics_service.execute_query", capture_query(NODE_HEALTH_ROWS)):
            await async_authed_client.get("/api/v1/metrics/node-health")
        assert CAPTURED
        assert all("ips" not in p for _, p in CAPTURED)

    async def test_time_series_counter_path_filter(self, async_authed_client, isolated_session):
        async with isolated_session() as session:
            await seed_nodes(session)
        with patch("app.services.metrics_service.execute_query", capture_query([])):
            await async_authed_client.get("/api/v1/metrics/edge_http_requests_total", params={"filter": "node:10.1.1.1"})
        assert calls_with_ips()
        sql, p = calls_with_ips()[0]
        assert "Attributes['ip'] IN" in sql

    async def test_route_stats_filter(self, async_authed_client, isolated_session):
        async with isolated_session() as session:
            cluster_id = await seed_nodes(session)
        with patch("app.services.metrics_service.execute_query", capture_query(ROUTE_ROWS)):
            await async_authed_client.get("/api/v1/metrics/route-stats", params={"filter": f"cluster:{cluster_id}"})
        assert calls_with_ips()
        assert "Attributes['ip'] IN" in calls_with_ips()[0][0]

    async def test_status_analysis_filter(self, async_authed_client, isolated_session):
        async with isolated_session() as session:
            cluster_id = await seed_nodes(session)
        with patch("app.services.metrics_service.execute_query", capture_query([("2xx", 10, 100.0)])):
            await async_authed_client.get("/api/v1/metrics/status-analysis", params={"filter": f"cluster:{cluster_id}"})
        assert calls_with_ips()

    async def test_time_comparison_all_branches_filtered(self, async_authed_client, isolated_session):
        """day/week 的每组 WHERE（今日/昨日、本周/上周）都必须带 ips——漏一处即静默不生效。"""
        async with isolated_session() as session:
            cluster_id = await seed_nodes(session)
        day_rows = [(100, 500)]
        with patch("app.services.metrics_service.execute_query", capture_query(day_rows)):
            await async_authed_client.get("/api/v1/metrics/time-comparison", params={"comparison_type": "day_over_day", "filter": f"cluster:{cluster_id}"})
        # day_over_day = 今日 + 昨日两组查询，两组都必须带 ips
        assert len(CAPTURED) == 2
        assert len(calls_with_ips()) == 2

        CAPTURED.clear()
        with patch("app.services.metrics_service.execute_query", capture_query(day_rows)):
            await async_authed_client.get("/api/v1/metrics/time-comparison", params={"comparison_type": "week_over_week", "filter": f"cluster:{cluster_id}"})
        assert len(CAPTURED) == 2
        assert len(calls_with_ips()) == 2

    async def test_summary_filters_connection_states_only(self, async_authed_client, isolated_session):
        """summary 特例：connectionStates 随筛选；summary 值查询与 source_ok 不带 ips（与指标查询页共享）。"""
        async with isolated_session() as session:
            cluster_id = await seed_nodes(session)

        def fake(sql, params=None):
            CAPTURED.append((sql, params or {}))
            if "NOT IN ('accepted', 'handled')" in sql:
                return [("active", 3.0)]
            if "state'] = 'accepted'" in sql:
                return [(5.0,)]
            return [("edge_x", 1.0)]

        with patch("app.services.metrics_service.execute_query", fake):
            resp = await async_authed_client.get("/api/v1/metrics/summary", params={"filter": f"cluster:{cluster_id}"})
        assert resp.status_code == 200
        assert resp.json()["source_ok"] is True
        # 分类按连接状态查询的独有片段（summary 的 gauge_latest 过滤子句也含指标名，子串误判）
        conn_calls = [
            (sql, p) for sql, p in CAPTURED
            if "NOT IN ('accepted', 'handled')" in sql or "state'] = 'accepted'" in sql
        ]
        assert conn_calls and all(p.get("ips") == ["10.1.1.1", "10.1.1.2"] for _, p in conn_calls)
        summary_calls = [
            (sql, p) for sql, p in CAPTURED
            if "NOT IN ('accepted', 'handled')" not in sql and "state'] = 'accepted'" not in sql
        ]
        assert summary_calls and all("ips" not in p for _, p in summary_calls)
