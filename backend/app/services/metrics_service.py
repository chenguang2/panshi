"""Metrics query service for ClickHouse data.

Provides high-level query functions that abstract away the OTel schema
(otel_metrics_gauge + otel_metrics_sum) and handle Counter vs Gauge distinction.
"""

import re
from typing import Any

from app.services.clickhouse_client import execute_query

# ── Helpers ────────────────────────────────────────────────────────────

_SINCE_PATTERN = re.compile(r"^(\d+)([smhd])$")
_INTERVAL_PATTERN = re.compile(r"^(\d+)([sm])$")


def _parse_since_seconds(since: str) -> int:
    m = _SINCE_PATTERN.match(since)
    if not m:
        return 3600  # default 1h
    val, unit = int(m.group(1)), m.group(2)
    return {"s": val, "m": val * 60, "h": val * 3600, "d": val * 86400}.get(unit, 3600)


def _parse_interval_seconds(interval: str) -> int:
    m = _INTERVAL_PATTERN.match(interval)
    if not m:
        return 300  # default 5m
    val, unit = int(m.group(1)), m.group(2)
    return {"s": val, "m": val * 60}.get(unit, 300)


def _is_counter(metric_name: str) -> tuple[bool, str]:
    """Check if a metric is a cumulative counter and return its source table.

    Returns (is_counter, source_table) where source_table is
    'otel_metrics_sum' or 'otel_metrics_gauge'.

    Detection order:
    1. Check otel_metrics_sum for monotonic cumulative sum (definitive OTel counter)
    2. Prometheus _total suffix heuristic (for gauge-stored counters)
    """
    # Check 1: OTel Sum table — monotonic cumulative = definitive counter
    rows = execute_query(
        "SELECT 1 FROM otel_metrics_sum "
        "WHERE MetricName = %(name)s AND IsMonotonic = 1 AND AggregationTemporality = 2 LIMIT 1",
        {"name": metric_name},
    )
    if rows:
        return True, "otel_metrics_sum"
    # Check 2: Prometheus convention — metric ends with _total
    if metric_name.endswith("_total"):
        return True, "otel_metrics_gauge"
    return False, "otel_metrics_gauge"


# ── Public API ─────────────────────────────────────────────────────────


def query_metric_names() -> list[str]:
    rows = execute_query(
        "SELECT DISTINCT MetricName FROM otel_metrics_gauge "
        "UNION DISTINCT "
        "SELECT DISTINCT MetricName FROM otel_metrics_sum "
        "ORDER BY MetricName"
    )
    if rows is None:
        return []
    return [r[0] for r in rows]


def query_time_series(
    metric_name: str,
    since: str = "1h",
    interval: str = "5m",
    label: str | None = None,
) -> list[dict[str, Any]]:
    since_sec = _parse_since_seconds(since)
    interval_sec = _parse_interval_seconds(interval)
    is_counter_val, source_table = _is_counter(metric_name)

    # Build label filter
    label_where = ""
    params: dict[str, Any] = {"name": metric_name, "since": since_sec}
    if label and ":" in label:
        key, val = label.split(":", 1)
        label_where = f"AND Attributes['{key}'] = %(label_val)s"
        params["label_val"] = val

    if is_counter_val:
        # Counter path — calculate rate
        params["delta"] = interval_sec
        sql = f"""
            SELECT
                toUnixTimestamp(toStartOfInterval(TimeUnix,
                              INTERVAL {interval_sec} SECOND)) AS bucket,
                greatest((max(Value) - min(Value)) / %(delta)s, 0) AS rate_val,
                count(*) AS sample_count
            FROM {source_table}
            WHERE MetricName = %(name)s
              AND TimeUnix > now() - INTERVAL %(since)s SECOND
              {label_where}
            GROUP BY bucket
            ORDER BY bucket
        """
        rows = execute_query(sql, params)
        if rows is None:
            return []
        return [
            {
                "metric_name": metric_name,
                "timestamp": r[0],
                "avg": max(float(r[1]), 0.0) if r[1] is not None else 0.0,
                "sample_count": r[2],
            }
            for r in rows
            if r[1] is not None
        ]

    # Gauge path — raw avg/max/min values
    sql = f"""
        SELECT
            toUnixTimestamp(toStartOfInterval(TimeUnix,
                          INTERVAL {interval_sec} SECOND)) AS bucket,
            avg(Value) AS avg_val,
            max(Value) AS max_val,
            min(Value) AS min_val,
            count(*) AS sample_count
        FROM otel_metrics_gauge
        WHERE MetricName = %(name)s
          AND TimeUnix > now() - INTERVAL %(since)s SECOND
          {label_where}
        GROUP BY bucket
        ORDER BY bucket
    """
    rows = execute_query(sql, params)
    if rows is None:
        return []
    return [
        {
            "metric_name": metric_name,
            "timestamp": r[0],
            "avg": float(r[1]),
            "max": float(r[2]),
            "min": float(r[3]),
            "sample_count": r[4],
        }
        for r in rows
    ]


def query_summary() -> dict[str, float]:
    rows = execute_query("""
        SELECT
            MetricName,
            argMax(Value, TimeUnix) AS latest_value
        FROM (
            SELECT MetricName, Value, TimeUnix FROM otel_metrics_gauge
            UNION ALL
            SELECT MetricName, Value, TimeUnix FROM otel_metrics_sum
        )
        WHERE TimeUnix > now() - INTERVAL 300 SECOND
        GROUP BY MetricName
        ORDER BY MetricName
    """)
    if rows is None:
        return {}
    return {r[0]: float(r[1]) for r in rows}
