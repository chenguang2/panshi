"""快速响应占比卡（metrics-fast-ratio-card）。

覆盖：
- query_fast_ratio_series：histogram 桶计数增量精确占比（`ΣΔ前 k 桶 / ΣΔCount`，前缀和非单格）、
  阈值取自 ExplicitBounds 并可经参数选择（仅桶边界合法）、ΔCount=0 桶不出点、
  无数据回退 10ms、SQL 形态（type=request / ip IN / lagInFrame 差分嵌套）
- query_fast_ratio_bucket_stats：各桶区间自身的精确占比/计数（design D9，2026-11-03 扩展）——
  差分语义与 series 同构、含溢出桶（长度 = len(bounds)+1）、ΣΔCount≤0 → null、逐元素钳 0
- GET /metrics/fast-ratio 端点：since/interval/filter/threshold_ms 接线、
  非法阈值与非法 filter 400 中文、响应信封 data + threshold_ms + bounds + bucket_stats
"""
import pytest
from unittest.mock import patch

from app.services.metrics_service import _fast_bucket_prefix_expr, query_fast_ratio_bucket_stats, query_fast_ratio_series


CAPTURED: list[tuple[str, dict]] = []

BOUNDS = [10.0, 20.0, 50.0, 100.0, 200.0, 500.0, 1000.0, 2000.0, 5000.0, 10000.0]

# 真实 SQL 输出形状：# 主查询 (bucket, ΣΔfast, ΣΔcount)；边界查询 (ExplicitBounds,)；
# 区间分布主查询 (f_deltas 数组, c_inc)（#43 mock 形状取自真实查询）
RATIO_ROWS = [(1793595300, 500, 500), (1793595600, 790, 800), (1793595900, 0, 0)]

# 区间分布主查询行形状：(逐桶钳 0 差分数组（含溢出桶，len = len(bounds)+1）, c_inc)
BUCKET_ROWS = [
    ([500, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0], 505),
    ([290, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0], 300),
]


def fake_ch(ratio_rows=RATIO_ROWS, bounds_rows=((BOUNDS,),), bucket_rows=BUCKET_ROWS):
    """边界查询返回单列行 (ExplicitBounds,)，与 clickhouse-driver 一致（#43）。"""

    def _fake(sql, params=None):
        CAPTURED.append((sql, params or {}))
        if "ExplicitBounds" in sql:
            return list(bounds_rows)
        if "argMax(BucketCounts" in sql:
            # 区间分布主查询（series 主查询是 argMax(arraySum(arraySlice(...))，不会命中此分支）
            return list(bucket_rows) if bucket_rows is not None else None
        return list(ratio_rows) if ratio_rows is not None else None
    return _fake


@pytest.fixture(autouse=True)
def _reset():
    CAPTURED.clear()
    yield
    CAPTURED.clear()


class TestQueryFastRatioSeries:
    def test_returns_points_skipping_zero_count_buckets(self):
        """ΔCount=0 的桶不出点：占比给 0% 会被误读为「全部请求都很慢」（design D3）。"""
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            result = query_fast_ratio_series("edge_http_latency", "1h", "5m")
        assert result["points"] == [
            {"metric_name": "edge_http_latency", "timestamp": 1793595300, "avg": 100.0, "sample_count": 500},
            {"metric_name": "edge_http_latency", "timestamp": 1793595600, "avg": 98.75, "sample_count": 800},
        ]

    def test_threshold_defaults_to_first_boundary(self):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            result = query_fast_ratio_series("edge_http_latency", "1h", "5m")
        assert result["threshold_ms"] == 10.0
        assert result["bounds"] == BOUNDS
        ratio_sql = [sql for sql, _ in CAPTURED if "ExplicitBounds" not in sql][0]
        assert "arraySum(arraySlice(BucketCounts, 1, 1))" in ratio_sql

    def test_threshold_selects_matching_boundary_index(self):
        """阈值只能是桶边界：100ms = 第 4 个边界 → 前 4 桶前缀和（≤100ms）。"""
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            result = query_fast_ratio_series("edge_http_latency", "1h", "5m", threshold_ms=100)
        assert result["threshold_ms"] == 100.0
        ratio_sql = [sql for sql, _ in CAPTURED if "ExplicitBounds" not in sql][0]
        assert "arraySum(arraySlice(BucketCounts, 1, 4))" in ratio_sql
        assert "arraySum(arraySlice(BucketCounts, 1, 1))" not in ratio_sql

    def test_invalid_threshold_raises_value_error(self):
        """桶内任意值（30ms）不可精确计算 → 拒绝，并列出合法边界。"""
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            with pytest.raises(ValueError) as exc:
                query_fast_ratio_series("edge_http_latency", "1h", "5m", threshold_ms=30)
        msg = str(exc.value)
        assert "阈值" in msg and "桶边界" in msg and "10 / 20" in msg
        # 非法阈值时不应再发起主查询
        assert all("ExplicitBounds" in sql for sql, _ in CAPTURED)

    def test_sql_shape(self):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            query_fast_ratio_series("edge_http_latency", "1h", "5m")
        ratio_sql, params = [r for r in CAPTURED if "ExplicitBounds" not in r[0]][0]
        assert "otel_metrics_histogram" in ratio_sql
        assert "lagInFrame" in ratio_sql
        # BucketCounts 是逐桶非累计计数 → 必须前缀求和，不能只取单格
        assert "arraySum(arraySlice(BucketCounts, 1, 1))" in ratio_sql
        assert "argMax(Count" in ratio_sql
        # 差分必须按序列分区：多节点/多序列时无 PARTITION BY 会把别的序列当上一个点（占比会失真）
        assert "PARTITION BY Attributes" in ratio_sql
        assert "Attributes['type'] = %(latency_type)s" in ratio_sql
        assert params["name"] == "edge_http_latency"
        assert params["latency_type"] == "request"
        assert "ips" not in params

    def test_threshold_prefix_is_monotone_by_bucket(self):
        """阈值越高 → 前缀桶越多（占比必单调不减）。

        2026-11-02 用户实测事故回归：曾用 `BucketCounts[k]` 取单格，
        10ms=99.96%、50ms=0.01%（后者只有「(20,50] 这一格」的计数）。
        """
        assert _fast_bucket_prefix_expr(1) == "arraySum(arraySlice(BucketCounts, 1, 1))"
        assert _fast_bucket_prefix_expr(2) == "arraySum(arraySlice(BucketCounts, 1, 2))"
        assert _fast_bucket_prefix_expr(3) == "arraySum(arraySlice(BucketCounts, 1, 3))"

    def test_threshold_50_uses_first_three_buckets(self):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            query_fast_ratio_series("edge_http_latency", "1h", "5m", threshold_ms=50)
        ratio_sql = [r for r in CAPTURED if "ExplicitBounds" not in r[0]][0][0]
        assert "arraySum(arraySlice(BucketCounts, 1, 3))" in ratio_sql
        assert "BucketCounts[3]" not in ratio_sql

    def test_latency_type_parametrized(self):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            query_fast_ratio_series("edge_http_latency", "1h", "5m", latency_type="upstream")
        assert all(p.get("latency_type") == "upstream" for _, p in CAPTURED)

    def test_ips_filter_in_sql_and_params(self):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            query_fast_ratio_series("edge_http_latency", "1h", "5m", ips=["10.0.0.1", "10.0.0.2"])
        for sql, params in CAPTURED:
            assert "Attributes['ip'] IN %(ips)s" in sql
            assert params["ips"] == ["10.0.0.1", "10.0.0.2"]

    def test_window_ratio_is_window_aggregate(self):
        """D13：头部值口径 = 全窗口聚合 ΣΔ前 k 桶 / ΣΔCount（与分布条同源，单次舍入）。"""
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            result = query_fast_ratio_series("edge_http_latency", "1h", "5m")
        # RATIO_ROWS: (500,500)+(790,800)+(0,0) → 1290/1300 = 99.23
        assert result["window_ratio"] == 99.23

    def test_window_ratio_none_when_no_requests(self):
        with patch("app.services.metrics_service.execute_query", fake_ch(ratio_rows=None, bounds_rows=())):
            result = query_fast_ratio_series("edge_http_latency", "1h", "5m")
        assert result["window_ratio"] is None

    def test_no_rows_falls_back_to_default_threshold(self):
        with patch("app.services.metrics_service.execute_query", fake_ch(ratio_rows=None, bounds_rows=())):
            result = query_fast_ratio_series("edge_http_latency", "1h", "5m")
        assert result == {"points": [], "threshold_ms": 10.0, "bounds": [], "window_ratio": None}


@pytest.mark.asyncio
class TestFastRatioEndpoint:
    async def test_endpoint_returns_data_threshold_and_bounds(self, async_authed_client):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            resp = await async_authed_client.get("/api/v1/metrics/fast-ratio")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"][0]["avg"] == 100.0
        assert body["data"][0]["timestamp"] == 1793595300
        assert body["threshold_ms"] == 10.0
        assert body["bounds"] == BOUNDS

    async def test_endpoint_returns_window_ratio(self, async_authed_client):
        """D13：响应信封带 window_ratio（头部窗口聚合口径）。"""
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            resp = await async_authed_client.get("/api/v1/metrics/fast-ratio")
        assert resp.status_code == 200
        assert resp.json()["window_ratio"] == 99.23

    async def test_endpoint_threshold_passthrough(self, async_authed_client):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            resp = await async_authed_client.get("/api/v1/metrics/fast-ratio", params={"threshold_ms": 200})
        assert resp.status_code == 200
        assert resp.json()["threshold_ms"] == 200.0
        ratio_sql = [sql for sql, _ in CAPTURED if "ExplicitBounds" not in sql][0]
        assert "arraySum(arraySlice(BucketCounts, 1, 5))" in ratio_sql

    async def test_endpoint_invalid_threshold_400(self, async_authed_client):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            resp = await async_authed_client.get("/api/v1/metrics/fast-ratio", params={"threshold_ms": 30})
        assert resp.status_code == 400
        assert "桶边界" in resp.json()["detail"]

    async def test_endpoint_invalid_filter_400(self, async_authed_client):
        resp = await async_authed_client.get("/api/v1/metrics/fast-ratio", params={"filter": "bogus"})
        assert resp.status_code == 400
        assert "筛选参数无效" in resp.json()["detail"]

    async def test_endpoint_filter_passthrough(self, async_authed_client, isolated_session):
        async with isolated_session() as session:
            from app.models.cluster import Cluster, Node
            cluster = Cluster(name="fast-ratio-cluster")
            session.add(cluster)
            await session.commit()
            await session.refresh(cluster)
            session.add(Node(cluster_id=cluster.id, ip="10.2.2.2", edge_path="/usr/local/openresty", service_port=80, management_port=9180))
            await session.commit()
            cluster_id = cluster.id

        with patch("app.services.metrics_service.execute_query", fake_ch()):
            resp = await async_authed_client.get("/api/v1/metrics/fast-ratio", params={"filter": f"cluster:{cluster_id}"})
        assert resp.status_code == 200
        mains = [(sql, p) for sql, p in CAPTURED if "ExplicitBounds" not in sql]
        assert len(mains) == 2  # series 主查询 + 区间分布主查询（D9）
        assert all("Attributes['ip'] IN %(ips)s" in sql for sql, _ in mains)
        assert all(p["ips"] == ["10.2.2.2"] for _, p in mains)

    async def test_endpoint_hour_interval_accepted_7d_view(self, async_authed_client):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            resp = await async_authed_client.get("/api/v1/metrics/fast-ratio", params={"since": "7d", "interval": "1h"})
        assert resp.status_code == 200


class TestQueryFastRatioBucketStats:
    """各桶区间精确占比/计数（design D9，2026-11-03 扩展）。

    差分语义与 query_fast_ratio_series 同构：按 Attributes 分区 lagInFrame 逐元素差分、
    负增量钳 0、跨序列跨时段求和；含溢出桶 (bounds[-1], +∞)。
    """

    def test_returns_counts_ratios_total(self):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            result = query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m")
        assert result is not None
        assert result["bounds"] == BOUNDS
        assert result["counts"] == [790, 8, 7, 0, 0, 0, 0, 0, 0, 0, 0]
        assert result["total"] == 805
        assert result["ratios"] == [98.14, 0.99, 0.87, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

    def test_includes_overflow_bucket(self):
        """末桶为溢出桶 (bounds[-1], +∞)：数组长度 = len(bounds) + 1 = 11。"""
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            result = query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m")
        assert result is not None
        assert len(result["ratios"]) == len(BOUNDS) + 1 == 11
        assert len(result["counts"]) == 11

    def test_rounding_two_decimals(self):
        bucket_rows = [([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], 3)]
        with patch("app.services.metrics_service.execute_query", fake_ch(bucket_rows=bucket_rows)):
            result = query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m")
        assert result is not None
        assert result["ratios"] == [33.33, 33.33, 33.33, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        assert result["total"] == 3

    def test_mixed_length_rows_padded(self):
        """窗口内边界变更导致数组长度不齐：按元素位置对齐求和，短行补 0。"""
        bucket_rows = [
            ([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1),
            ([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1),
        ]
        with patch("app.services.metrics_service.execute_query", fake_ch(bucket_rows=bucket_rows)):
            result = query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m")
        assert result is not None
        assert result["counts"] == [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        assert result["ratios"] == [100.0, 50.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

    def test_zero_total_returns_none(self):
        """ΣΔCount=0（窗口无请求）→ None：不显示全 0 分布（D3 同语义）。"""
        bucket_rows = [([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0)]
        with patch("app.services.metrics_service.execute_query", fake_ch(bucket_rows=bucket_rows)):
            result = query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m")
        assert result is None

    def test_no_rows_returns_none(self):
        with patch("app.services.metrics_service.execute_query", fake_ch(bucket_rows=None)):
            result = query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m")
        assert result is None

    def test_no_bounds_returns_none_without_main_query(self):
        with patch("app.services.metrics_service.execute_query", fake_ch(bounds_rows=())):
            result = query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m")
        assert result is None
        assert all("ExplicitBounds" in sql for sql, _ in CAPTURED)

    def test_sql_shape(self):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m")
        bucket_sql, params = [r for r in CAPTURED if "argMax(BucketCounts" in r[0]][0]
        assert "otel_metrics_histogram" in bucket_sql
        # 逐桶非累计数组：argMax 取数组 → lagInFrame 逐元素差分（与 series 同一守卫）
        assert "argMax(BucketCounts, TimeUnix)" in bucket_sql
        assert "lagInFrame(f_arr, 1, f_arr)" in bucket_sql
        assert "PARTITION BY Attributes" in bucket_sql
        assert "greatest(f - p, 0)" in bucket_sql
        # 长度不齐按最短截断（边界变更窗口内）
        assert "least(length(f_arr), length(f_prev))" in bucket_sql
        assert "Attributes['type'] = %(latency_type)s" in bucket_sql
        assert params["name"] == "edge_http_latency"
        assert params["latency_type"] == "request"
        assert "ips" not in params

    def test_bounds_param_skips_bounds_query(self):
        """端点复用 series 已取的 bounds → 不重复发边界查询。"""
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            result = query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m", bounds=BOUNDS)
        assert result is not None and result["bounds"] == BOUNDS
        assert all("ExplicitBounds" not in sql for sql, _ in CAPTURED)

    def test_latency_type_parametrized(self):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m", latency_type="upstream")
        assert all(p.get("latency_type") == "upstream" for _, p in CAPTURED)

    def test_ips_filter_in_sql_and_params(self):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            query_fast_ratio_bucket_stats("edge_http_latency", "1h", "5m", ips=["10.0.0.1"])
        bucket_sql, params = [r for r in CAPTURED if "argMax(BucketCounts" in r[0]][0]
        assert "Attributes['ip'] IN %(ips)s" in bucket_sql
        assert params["ips"] == ["10.0.0.1"]


@pytest.mark.asyncio
class TestFastRatioBucketStatsEndpoint:
    async def test_endpoint_returns_bucket_stats(self, async_authed_client):
        with patch("app.services.metrics_service.execute_query", fake_ch()):
            resp = await async_authed_client.get("/api/v1/metrics/fast-ratio")
        assert resp.status_code == 200
        stats = resp.json()["bucket_stats"]
        assert stats["bounds"] == BOUNDS
        assert stats["counts"] == [790, 8, 7, 0, 0, 0, 0, 0, 0, 0, 0]
        assert stats["total"] == 805
        assert stats["ratios"][0] == 98.14

    async def test_endpoint_bucket_stats_null_when_no_requests(self, async_authed_client):
        with patch("app.services.metrics_service.execute_query", fake_ch(bucket_rows=None)):
            resp = await async_authed_client.get("/api/v1/metrics/fast-ratio")
        assert resp.status_code == 200
        assert resp.json()["bucket_stats"] is None
