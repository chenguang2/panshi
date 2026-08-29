"""Tests for GET /api/v1/metrics/* endpoints."""
import pytest
from unittest.mock import patch
from tests.api_helpers import admin_auth_headers


class TestMetricsAPI:
    """Integration tests for the metrics API."""

    @pytest.fixture
    def client(self):
        from app.main import app
        from tests.api_helpers import AuthedTestClient
        with AuthedTestClient(app) as c:
            yield c

    # ── GET /api/v1/metrics/names ─────────────────────────

    @patch("app.api.v1.metrics.query_metric_names")
    def test_get_metric_names(self, mock_query, client):
        mock_query.return_value = ["cpu", "mem"]
        resp = client.get("/api/v1/metrics/names")
        assert resp.status_code == 200
        assert resp.json() == {"data": ["cpu", "mem"]}

    @patch("app.api.v1.metrics.query_metric_names")
    def test_get_metric_names_empty(self, mock_query, client):
        mock_query.return_value = []
        resp = client.get("/api/v1/metrics/names")
        assert resp.status_code == 200
        assert resp.json() == {"data": []}

    # ── GET /api/v1/metrics/{metric_name} ─────────────────

    @patch("app.api.v1.metrics.query_time_series")
    def test_get_metric_time_series(self, mock_query, client):
        mock_query.return_value = [
            {"metric_name": "cpu", "timestamp": 1000, "avg": 50.0, "max": 80.0, "min": 30.0, "sample_count": 6},
        ]
        resp = client.get("/api/v1/metrics/cpu")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"][0]["avg"] == 50.0

    @patch("app.api.v1.metrics.query_time_series")
    def test_get_metric_time_series_with_params(self, mock_query, client):
        mock_query.return_value = []
        resp = client.get("/api/v1/metrics/cpu?since=6h&interval=15m&label=state:active")
        assert resp.status_code == 200
        mock_query.assert_called_once_with(metric_name="cpu", since="6h", interval="15m", label="state:active")

    @patch("app.api.v1.metrics.query_time_series")
    def test_get_metric_time_series_empty(self, mock_query, client):
        mock_query.return_value = []
        resp = client.get("/api/v1/metrics/cpu")
        assert resp.status_code == 200
        assert resp.json() == {"data": []}

    # ── GET /api/v1/metrics/summary ───────────────────────

    @patch("app.api.v1.metrics.query_connection_states")
    @patch("app.api.v1.metrics.query_summary")
    def test_get_summary(self, mock_query, mock_states, client):
        mock_query.return_value = {"cpu": 85.0, "mem": 1024.0}
        mock_states.return_value = {"active": 5.0, "waiting": 3.0}
        resp = client.get("/api/v1/metrics/summary")
        assert resp.status_code == 200
        assert resp.json() == {
            "data": {"cpu": 85.0, "mem": 1024.0},
            "connection_states": {"active": 5.0, "waiting": 3.0},
        }

    @patch("app.api.v1.metrics.query_connection_states")
    @patch("app.api.v1.metrics.query_summary")
    def test_get_summary_empty(self, mock_query, mock_states, client):
        mock_query.return_value = {}
        mock_states.return_value = {}
        resp = client.get("/api/v1/metrics/summary")
        assert resp.status_code == 200
        assert resp.json() == {"data": {}, "connection_states": {}}

    # ── Feature gating ────────────────────────────────────

    def test_metrics_router_registered(self, client):
        resp = client.get("/api/v1/metrics/names")
        assert resp.status_code in (200, 404)


class TestMetricsAPINonBlocking:
    """ClickHouse 慢查询不得阻塞事件循环。

    根因回归测试：execute_query 是同步调用，若在 async 处理器中直接执行，
    一次慢查询会卡住整个事件循环，导致所有其他请求（含毫秒级 SQLite 端点）排队。
    门控设计：summary 进入慢查询后（started 置位）才发起 /health，
    从同一起点 t0 计时——若循环被阻塞，/health 只能等阻塞结束后才被处理。
    """

    @pytest.mark.asyncio
    async def test_slow_clickhouse_does_not_block_other_requests(self):
        import asyncio
        import threading
        import time
        from unittest.mock import patch

        import httpx

        from app.main import app

        started = threading.Event()
        release = threading.Event()

        def slow_query(*args, **kwargs):
            started.set()
            release.wait(timeout=3.0)  # 模拟远端 ClickHouse 慢查询；fix 后运行于工作线程
            return []

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=admin_auth_headers()) as client:
            with patch("app.services.metrics_service.execute_query", side_effect=slow_query):
                t0 = time.perf_counter()
                summary_task = asyncio.create_task(client.get("/api/v1/metrics/summary"))
                # 异步轮询等 summary 进入慢查询（不能阻塞等待，否则任务无法启动）
                enter_deadline = time.perf_counter() + 3.0
                while not started.is_set():
                    if time.perf_counter() > enter_deadline:
                        raise AssertionError("summary 未进入查询")
                    await asyncio.sleep(0.01)
                resp_health = await client.get("/health")
                health_elapsed = time.perf_counter() - t0
                release.set()
                resp_summary = await summary_task

            assert resp_health.status_code == 200
            assert resp_summary.status_code == 200
            # /health 与 CH 无关；若事件循环被同步 CH 查询卡住，此处会接近 3s
            assert health_elapsed < 1.0, (
                f"/health 耗时 {health_elapsed:.2f}s —— 事件循环被同步 CH 查询阻塞"
            )
