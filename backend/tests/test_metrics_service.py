"""Tests for metrics query service."""
import pytest
from unittest.mock import patch


class TestMetricsService:
    """Unit tests for app.services.metrics_service."""

    # ── query_metric_names ─────────────────────────────────

    @patch("app.services.metrics_service.execute_query")
    def test_metric_names_returns_list(self, mock_exec):
        mock_exec.return_value = [("cpu_usage",), ("memory_usage",)]
        from app.services.metrics_service import query_metric_names
        result = query_metric_names()
        assert result == ["cpu_usage", "memory_usage"]
        mock_exec.assert_called_once()

    @patch("app.services.metrics_service.execute_query")
    def test_metric_names_empty(self, mock_exec):
        mock_exec.return_value = []
        from app.services.metrics_service import query_metric_names
        assert query_metric_names() == []

    @patch("app.services.metrics_service.execute_query")
    def test_metric_names_none_from_clickhouse(self, mock_exec):
        mock_exec.return_value = None
        from app.services.metrics_service import query_metric_names
        assert query_metric_names() == []

    # ── query_time_series ──────────────────────────────────

    @patch("app.services.metrics_service.execute_query")
    def test_time_series_gauge(self, mock_exec):
        mock_exec.side_effect = [
            [],  # _is_counter: not found in otel_metrics_sum
            [
                (1690000000, 50.0, 80.0, 30.0, 6),
                (1690000300, 55.0, 85.0, 35.0, 6),
            ],  # gauge data (bucket, avg, max, min, count)
        ]
        from app.services.metrics_service import query_time_series
        result = query_time_series("cpu_usage")
        assert len(result) == 2
        assert result[0]["avg"] == 50.0
        assert result[0]["metric_name"] == "cpu_usage"

    @patch("app.services.metrics_service.execute_query")
    def test_time_series_counter_from_gauge(self, mock_exec):
        """Counter metric in gauge table via _total suffix."""
        mock_exec.side_effect = [
            [],  # _is_counter: not found in otel_metrics_sum
            [
                (1690000000, 0.5, 6),  # rate, sample_count
            ],
        ]
        from app.services.metrics_service import query_time_series
        result = query_time_series("edge_http_requests_total")
        assert len(result) == 1
        assert result[0]["avg"] == 0.5

    @patch("app.services.metrics_service.execute_query")
    def test_time_series_counter_from_sum(self, mock_exec):
        """Counter metric in otel_metrics_sum (IsMonotonic + Cumulative)."""
        mock_exec.side_effect = [
            [(1,)],  # _is_counter: found in otel_metrics_sum
            [
                (1690000000, 0.0, 6),  # rate, sample_count
            ],
        ]
        from app.services.metrics_service import query_time_series
        result = query_time_series("edge_metric_errors_total")
        assert len(result) == 1
        assert result[0]["avg"] == 0.0

    @patch("app.services.metrics_service.execute_query")
    def test_time_series_with_label(self, mock_exec):
        mock_exec.side_effect = [
            [],  # _is_counter: not found in otel_metrics_sum
            [(1690000000, 10.0, 20.0, 5.0, 3)],
        ]
        from app.services.metrics_service import query_time_series
        result = query_time_series(
            "edge_nginx_http_current_connections",
            label="state:active",
        )
        assert len(result) == 1
        label_call = mock_exec.call_args_list[1]
        assert "Attributes['state']" in label_call[0][0]

    @patch("app.services.metrics_service.execute_query")
    def test_time_series_no_data(self, mock_exec):
        mock_exec.side_effect = [[], []]
        from app.services.metrics_service import query_time_series
        assert query_time_series("cpu_usage") == []

    @patch("app.services.metrics_service.execute_query")
    def test_time_series_negative_rate_clamped(self, mock_exec):
        mock_exec.side_effect = [
            [],  # _is_counter: not found in otel_metrics_sum → _total suffix
            [(1690000000, -2.0, 3)],  # negative rate
        ]
        from app.services.metrics_service import query_time_series
        result = query_time_series("edge_http_requests_total")
        assert result[0]["avg"] == 0.0

    @patch("app.services.metrics_service.execute_query")
    def test_time_series_parse_since_and_interval(self, mock_exec):
        mock_exec.side_effect = [
            [],  # _is_counter: not found in otel_metrics_sum
            [(1690000000, 50.0, 60.0, 40.0, 12)],
        ]
        from app.services.metrics_service import query_time_series
        result = query_time_series("cpu_usage", since="6h", interval="15m")
        assert len(result) == 1
        params = mock_exec.call_args_list[1][0][1]
        assert params["since"] == 21600
        assert "900" in mock_exec.call_args_list[1][0][0]

    # ── query_summary ──────────────────────────────────────

    @patch("app.services.metrics_service.execute_query")
    def test_summary_gauge_latest_and_counter_increment(self, mock_exec):
        """Gauge 返回最新值；计数器（sum 表 + gauge 表 _total 后缀）返回窗口内增量。"""
        mock_exec.side_effect = [
            [("cpu_usage", 85.0)],                    # gauge 最新值（排除 _total）
            [("edge_http_requests_total", 1234.0)],   # sum 表计数器增量
            [("edge_plugin_errors_total", 5.0)],      # gauge 表 _total 计数器增量
        ]
        from app.services.metrics_service import query_summary
        result = query_summary()
        assert result["cpu_usage"] == 85.0
        assert result["edge_http_requests_total"] == 1234.0
        assert result["edge_plugin_errors_total"] == 5.0

    @patch("app.services.metrics_service.execute_query")
    def test_summary_gauge_query_excludes_total_suffix(self, mock_exec):
        """gauge 最新值查询必须排除 _total 后缀（它们是计数器，不能取原始值）。"""
        mock_exec.side_effect = [[], [], []]
        from app.services.metrics_service import query_summary
        query_summary()
        first_sql = mock_exec.call_args_list[0][0][0]
        assert "NOT endsWith(MetricName, '_total')" in first_sql
        third_sql = mock_exec.call_args_list[2][0][0]
        assert "endsWith(MetricName, '_total')" in third_sql

    @patch("app.services.metrics_service.execute_query")
    def test_summary_connections_only_active_state(self, mock_exec):
        """Nginx 连接数按总览同口径：仅统计 state=active 序列，多序列求和。"""
        mock_exec.side_effect = [
            [("edge_nginx_http_current_connections", 1.0)],
            [],
            [],
        ]
        from app.services.metrics_service import query_summary
        result = query_summary()
        assert result["edge_nginx_http_current_connections"] == 1.0
        first_sql = mock_exec.call_args_list[0][0][0]
        assert "Attributes['state'] = 'active'" in first_sql
        # 多节点/多序列：逐序列取最新后求和，而非全局 argMax
        assert "GROUP BY MetricName, Attributes" in first_sql

    @patch("app.services.metrics_service.execute_query")
    def test_summary_empty(self, mock_exec):
        mock_exec.side_effect = [[], [], []]
        from app.services.metrics_service import query_summary
        assert query_summary() == {}

    @patch("app.services.metrics_service.execute_query")
    def test_summary_none(self, mock_exec):
        mock_exec.side_effect = [None, None, None]
        from app.services.metrics_service import query_summary
        assert query_summary() == {}

    # ── query_connection_states ────────────────────────────

    @patch("app.services.metrics_service.execute_query")
    def test_connection_states_multi_state(self, mock_exec):
        """按 state 标签分组返回各瞬时状态连接数，accepted 窗口增量单独返回。"""
        mock_exec.side_effect = [
            [("active", 479.0), ("reading", 0.0), ("writing", 1.0), ("waiting", 478.0)],
            [(2.0,)],  # accepted 窗口增量
        ]
        from app.services.metrics_service import query_connection_states
        result = query_connection_states()
        assert result == {
            "active": 479.0, "reading": 0.0, "writing": 1.0, "waiting": 478.0,
            "accepted_delta": 2.0,
        }

    @patch("app.services.metrics_service.execute_query")
    def test_connection_states_excludes_cumulative(self, mock_exec):
        """accepted/handled 是自启动累计计数器，不得混入瞬时状态。"""
        mock_exec.side_effect = [[("active", 5.0)], [None]]
        from app.services.metrics_service import query_connection_states
        result = query_connection_states()
        assert result == {"active": 5.0}
        first_sql = mock_exec.call_args_list[0][0][0]
        assert "NOT IN ('accepted', 'handled')" in first_sql
        second_sql = mock_exec.call_args_list[1][0][0]
        assert "Attributes['state'] = 'accepted'" in second_sql

    @patch("app.services.metrics_service.execute_query")
    def test_connection_states_empty(self, mock_exec):
        mock_exec.side_effect = [[], []]
        from app.services.metrics_service import query_connection_states
        assert query_connection_states() == {}

    @patch("app.services.metrics_service.execute_query")
    def test_connection_states_none(self, mock_exec):
        mock_exec.side_effect = [None, None]
        from app.services.metrics_service import query_connection_states
        assert query_connection_states() == {}

    @patch("app.services.metrics_service.execute_query")
    def test_connection_states_skips_blank_state(self, mock_exec):
        """无 state 标签的序列（空字符串）不计入结果。"""
        mock_exec.side_effect = [[("active", 10.0), ("", 3.0)], []]
        from app.services.metrics_service import query_connection_states
        assert query_connection_states() == {"active": 10.0}

    @patch("app.services.metrics_service.execute_query")
    def test_connection_states_groups_by_series_latest(self, mock_exec):
        """SQL 必须先按序列（Attributes）取 argMax 最新值，再按 state 求和。"""
        mock_exec.side_effect = [[("active", 5.0)], []]
        from app.services.metrics_service import query_connection_states
        query_connection_states()
        sql = mock_exec.call_args_list[0][0][0]
        assert "GROUP BY Attributes" in sql
        assert "argMax(Value, TimeUnix)" in sql
        assert "edge_nginx_http_current_connections" in sql
