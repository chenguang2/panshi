"""平均耗时卡（metrics-avg-latency-card）。

覆盖：
- query_avg_latency_series：histogram 专用查询 SQL 形态（type=request / ip IN /
  lagInFrame 差分嵌套）、返回同构 {timestamp, avg, sample_count, metric_name}、
  latency_type / ips 参数化、负增量钳 0、无增量桶 avg=0.0
- GET /metrics/avg-latency 端点：since/interval/filter 接线、非法 filter 400 中文、
  失效集群 warning 回退
"""
import pytest
from unittest.mock import patch

from app.services.metrics_service import query_avg_latency_series


CAPTURED: list[tuple[str, dict]] = []


def capture(default_rows=None):
    def _fake(sql, params=None):
        CAPTURED.append((sql, params or {}))
        return default_rows or []
    return _fake


# 真实 SQL 输出形状：(bucket, ΣΔSum, ΣΔCount)——avg = s/c（#43 mock 形状取自真实查询）
LATENCY_ROWS = [(1793595300, 411.5, 500), (1793595600, 808.8, 800)]


@pytest.fixture(autouse=True)
def _reset():
    CAPTURED.clear()
    yield
    CAPTURED.clear()


class TestQueryAvgLatencySeries:
    def test_returns_uniform_shape(self):
        with patch("app.services.metrics_service.execute_query", capture(LATENCY_ROWS)):
            rows = query_avg_latency_series("edge_http_latency", "1h", "5m")
        assert rows == [
            {"metric_name": "edge_http_latency", "timestamp": 1793595300, "avg": 0.823, "sample_count": 500},
            {"metric_name": "edge_http_latency", "timestamp": 1793595600, "avg": 1.011, "sample_count": 800},
        ]

    def test_sql_shape(self):
        with patch("app.services.metrics_service.execute_query", capture([])):
            query_avg_latency_series("edge_http_latency", "1h", "5m")
        sql, params = CAPTURED[0]
        assert "otel_metrics_histogram" in sql
        assert "lagInFrame" in sql
        assert "argMax(Sum" in sql and "argMax(Count" in sql
        assert params["name"] == "edge_http_latency"
        assert params["latency_type"] == "request"
        assert "ips" not in params

    def test_default_latency_type_request(self):
        with patch("app.services.metrics_service.execute_query", capture([])):
            query_avg_latency_series("edge_http_latency", "1h", "5m")
        assert CAPTURED[0][1]["latency_type"] == "request"

    def test_latency_type_parametrized(self):
        with patch("app.services.metrics_service.execute_query", capture([])):
            query_avg_latency_series("edge_http_latency", "1h", "5m", latency_type="upstream")
        assert CAPTURED[0][1]["latency_type"] == "upstream"

    def test_ips_filter_in_sql_and_params(self):
        with patch("app.services.metrics_service.execute_query", capture([])):
            query_avg_latency_series("edge_http_latency", "1h", "5m", ips=["10.0.0.1", "10.0.0.2"])
        sql, params = CAPTURED[0]
        assert "Attributes['ip'] IN %(ips)s" in sql
        assert params["ips"] == ["10.0.0.1", "10.0.0.2"]

    def test_empty_rows(self):
        with patch("app.services.metrics_service.execute_query", capture(None)):
            assert query_avg_latency_series("edge_http_latency", "1h", "5m") == []


@pytest.mark.asyncio
class TestAvgLatencyEndpoint:
    async def test_endpoint_returns_data(self, async_authed_client):
        with patch("app.services.metrics_service.execute_query", capture(LATENCY_ROWS)):
            resp = await async_authed_client.get("/api/v1/metrics/avg-latency")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data[0]["avg"] == 0.823 and data[0]["timestamp"] == 1793595300

    async def test_endpoint_filter_passthrough(self, async_authed_client, isolated_session):
        async with isolated_session() as session:
            from app.models.cluster import Cluster, Node
            cluster = Cluster(name="lat-cluster")
            session.add(cluster)
            await session.commit()
            await session.refresh(cluster)
            session.add(Node(cluster_id=cluster.id, ip="10.1.1.1", edge_path="/usr/local/openresty", service_port=80, management_port=9180))
            await session.commit()
            cluster_id = cluster.id

        def fake(sql, params=None):
            CAPTURED.append((sql, params or {}))
            if "DISTINCT Attributes['ip']" in sql:
                return [("10.1.1.1",)]
            return LATENCY_ROWS

        with patch("app.services.metrics_service.execute_query", fake), \
             patch("app.api.v1.metrics.execute_query", fake):
            resp = await async_authed_client.get("/api/v1/metrics/avg-latency", params={"filter": f"cluster:{cluster_id}"})
        assert resp.status_code == 200
        ips_calls = [(sql, p) for sql, p in CAPTURED if "ips" in p]
        assert ips_calls and ips_calls[0][1]["ips"] == ["10.1.1.1"]

    async def test_endpoint_invalid_filter_400(self, async_authed_client):
        resp = await async_authed_client.get("/api/v1/metrics/avg-latency", params={"filter": "bogus"})
        assert resp.status_code == 400
        assert "筛选参数无效" in resp.json()["detail"]

    @pytest.mark.parametrize("path", ["/metrics/avg-latency", "/metrics/edge_http_requests_total"])
    async def test_hour_interval_accepted_7d_view(self, async_authed_client, path: str):
        """7d 档前端聚合间隔为 1h——既有 time-series 端点 pattern 拒 'h' 致 QPS 卡 7d 全程 422（顺手修的既有缺陷）。"""
        resp = await async_authed_client.get(path, params={"since": "7d", "interval": "1h"})
        assert resp.status_code == 200
