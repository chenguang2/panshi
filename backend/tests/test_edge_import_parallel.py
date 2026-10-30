"""test_connection / fetch_edge_data 并行化回归（edge-import-ux-review-fixes）。

背景：两方法原先串行调用 9 次 Edge Admin HTTP，节点网络慢（~4.7s/次）时
连接测试实测 42-44s（用户评审实测 192.168.0.13/14），期间前端零过程反馈。
并行化后总耗时 ≈ 最慢单请求。语义保持：routes/upstreams 失败 → success False
（关键路）；其余单路失败不阻塞（test_connection 兜底 0 / fetch_edge_data 记 warning）。
"""
import time
from unittest.mock import MagicMock

from app.services.edge_import_service import EdgeImportService


def _slow_client(delay: float, fail: set[str] = frozenset()) -> MagicMock:
    """构造各取数方法带 sleep 的 mock client（fail 集合中的方法抛异常）。

    注意 wrap 后函数 __name__ 统一为 run——fail 判断用显式 name 闭包而非 __name__。
    """
    client = MagicMock()

    fns: dict[str, callable] = {
        "list_routes": lambda: {"list": [{"value": {"id": "r1"}}], "total": 1},
        "list_upstreams": lambda: {"list": [{"value": {"id": "u1", "name": "up"}}], "total": 1},
        "list_available_plugins": lambda: [{"name": "limit-req"}],
        "list_plugin_configs": lambda: {"list": [], "total": 0},
        "list_global_rules": lambda: {"list": [], "total": 0},
        "list_plugin_metadata": lambda: {"list": [], "total": 0},
        "list_stream_routes": lambda: [],
    }

    def wrap(name: str, fn):
        def run(*args, **kwargs):
            time.sleep(delay)
            if name in fail:
                raise RuntimeError(f"edge api down: {name}")
            return fn(*args, **kwargs)
        return run

    for name, fn in fns.items():
        setattr(client, name, wrap(name, fn))

    def request(method: str, path: str):
        time.sleep(delay)
        if "_request" in fail:
            raise RuntimeError("edge api down: _request")
        return {"list": []} if path == "/edge/admin/ssl" else {}

    client._request = request
    return client


def _service(client) -> EdgeImportService:
    return EdgeImportService(
        cluster_id=1, node_id=2, db_session=None,
        ip="10.6.98.14", port=16620, edge_path="/edge",
        client=client, route_info={},
    )


class TestConnectionParallel:
    def test_parallel_latency_under_serial_sum(self):
        """9 路 sleep 0.3s：串行 ≈2.7s，并行应 <1.5s（≈最慢单请求）。"""
        svc = _service(_slow_client(0.3))
        t0 = time.time()
        result = svc.test_connection()
        elapsed = time.time() - t0
        assert result["success"] is True
        assert result["route_count"] == 1
        assert result["upstream_count"] == 1
        assert elapsed < 1.5, f"并行化失效：耗时 {elapsed:.2f}s（串行基线 2.7s）"

    def test_critical_route_failure_marks_unsuccess(self):
        """关键路（routes）失败 → success False（语义保持）。"""
        svc = _service(_slow_client(0.01, fail={"list_routes"}))
        result = svc.test_connection()
        assert result["success"] is False
        assert "list_routes" in result.get("message", "")

    def test_optional_path_failure_does_not_block(self):
        """可选路（plugins）失败 → 该计数 0，整体仍成功（语义保持）。"""
        svc = _service(_slow_client(0.01, fail={"list_available_plugins"}))
        result = svc.test_connection()
        assert result["success"] is True
        assert result["plugin_count"] == 0


class TestFetchEdgeDataParallel:
    def test_parallel_latency_under_serial_sum(self):
        """7 路 sleep 0.3s：并行应 <1.2s。"""
        svc = _service(_slow_client(0.3))
        t0 = time.time()
        data = svc.fetch_edge_data()
        elapsed = time.time() - t0
        assert elapsed < 1.2, f"并行化失效：耗时 {elapsed:.2f}s"
        assert data["routes"] == []  # dict 形态按原语义置空（非 list 不采用）
        assert data["upstreams"] == [{"id": "u1", "name": "up"}]
        assert data["warnings"] == []

    def test_single_failure_records_warning(self):
        """单路失败记录 warning、不阻塞其余（语义保持）。"""
        svc = _service(_slow_client(0.01, fail={"list_upstreams"}))
        data = svc.fetch_edge_data()
        assert data["upstreams"] == []
        assert any("上游获取失败" in w for w in data["warnings"])
        assert data["routes"] == []  # dict 形态置空（原语义）
