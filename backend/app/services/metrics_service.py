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


def query_route_stats(
    stats_type: str = "qps",
    since: str = "24h",
    limit: int = 10,
    latency_type: str = "request",
) -> list[dict[str, Any]]:
    since_sec = _parse_since_seconds(since)

    if stats_type == "qps":
        return _query_route_qps(since_sec, limit)
    elif stats_type == "bandwidth":
        return _query_route_bandwidth(since_sec, limit)
    elif stats_type == "error_rate":
        return _query_route_error_rate(since_sec, limit)
    elif stats_type == "latency":
        return _query_route_latency(since_sec, limit, latency_type)
    return []


def _query_route_qps(since_sec: int, limit: int) -> list[dict[str, Any]]:
    rows = execute_query("""
        SELECT
            Attributes['route'] AS route_id,
            Attributes['matched_uri'] AS uri,
            greatest(max(Value) / %(since)s, 0) AS requests_per_sec,
            max(Value) AS total_requests,
            count(*) AS sample_count
        FROM otel_metrics_sum
        WHERE MetricName = 'edge_http_status'
          AND TimeUnix > now() - INTERVAL %(since)s SECOND
        GROUP BY route_id, uri
        ORDER BY requests_per_sec DESC
        LIMIT %(limit)s
    """, {"since": since_sec, "limit": limit})

    if rows is None:
        return []
    return [
        {
            "route_id": r[0],
            "uri": r[1],
            "requests_per_sec": float(r[2]),
            "total_requests": int(r[3]),
            "sample_count": int(r[4]),
        }
        for r in rows
    ]


def _query_route_bandwidth(since_sec: int, limit: int) -> list[dict[str, Any]]:
    rows = execute_query("""
        SELECT
            Attributes['route'] AS route_id,
            Attributes['matched_uri'] AS uri,
            Attributes['type'] AS direction,
            greatest(max(Value) / %(since)s, 0) AS bytes_per_sec,
            max(Value) AS total_bytes
        FROM otel_metrics_sum
        WHERE MetricName = 'edge_bandwidth'
          AND TimeUnix > now() - INTERVAL %(since)s SECOND
        GROUP BY route_id, uri, direction
        ORDER BY total_bytes DESC
        LIMIT %(limit)s
    """, {"since": since_sec, "limit": limit})

    if rows is None:
        return []
    return [
        {
            "route_id": r[0],
            "uri": r[1],
            "direction": r[2],
            "bytes_per_sec": float(r[3]),
            "total_bytes": int(r[4]),
        }
        for r in rows]


def _query_route_error_rate(since_sec: int, limit: int) -> list[dict[str, Any]]:
    rows = execute_query("""
        SELECT
            Attributes['route'] AS route_id,
            Attributes['matched_uri'] AS uri,
            sumIf(max(Value), Attributes['code'] LIKE '4%%') AS client_errors,
            sumIf(max(Value), Attributes['code'] LIKE '5%%') AS server_errors,
            sum(max(Value)) AS total_requests,
            count(*) AS sample_count
        FROM otel_metrics_sum
        WHERE MetricName = 'edge_http_status'
          AND TimeUnix > now() - INTERVAL %(since)s SECOND
        GROUP BY route_id, uri
        HAVING total_requests > 0
        ORDER BY client_errors + server_errors DESC
        LIMIT %(limit)s
    """, {"since": since_sec, "limit": limit})

    if rows is None:
        return []
    return [
        {
            "route_id": r[0],
            "uri": r[1],
            "client_errors": int(r[2]),
            "server_errors": int(r[3]),
            "total_requests": int(r[4]),
            "error_rate_pct": round((int(r[2]) + int(r[3])) * 100.0 / int(r[4]), 2) if int(r[4]) > 0 else 0.0,
            "sample_count": int(r[5]),
        }
        for r in rows
    ]


def _query_route_latency(since_sec: int, limit: int, latency_type: str) -> list[dict[str, Any]]:
    rows = execute_query("""
        SELECT
            Attributes['route'] AS route_id,
            Attributes['matched_uri'] AS uri,
            Attributes['type'] AS latency_type,
            avg(Sum / Count) AS avg_latency_ms,
            max(Max) AS max_latency_ms,
            count(*) AS sample_count
        FROM otel_metrics_histogram
        WHERE MetricName = 'edge_http_latency'
          AND TimeUnix > now() - INTERVAL %(since)s SECOND
          AND Attributes['type'] = %(latency_type)s
        GROUP BY route_id, uri, latency_type
        ORDER BY avg_latency_ms DESC
        LIMIT %(limit)s
    """, {"since": since_sec, "latency_type": latency_type, "limit": limit})

    if rows is None:
        return []
    return [
        {
            "route_id": r[0],
            "uri": r[1],
            "latency_type": r[2],
            "avg_latency_ms": float(r[3]),
            "max_latency_ms": float(r[4]),
            "sample_count": int(r[5]),
        }
        for r in rows
    ]


def query_status_analysis(since: str = "24h") -> list[dict[str, Any]]:
    since_sec = _parse_since_seconds(since)
    rows = execute_query("""
        SELECT
            CASE
                WHEN Attributes['code'] LIKE '2%%' THEN '2xx'
                WHEN Attributes['code'] LIKE '3%%' THEN '3xx'
                WHEN Attributes['code'] LIKE '4%%' THEN '4xx'
                WHEN Attributes['code'] LIKE '5%%' THEN '5xx'
                ELSE '其他'
            END AS status_class,
            max(Value) AS request_count
        FROM otel_metrics_sum
        WHERE MetricName = 'edge_http_status'
          AND TimeUnix > now() - INTERVAL %(since)s SECOND
        GROUP BY status_class
        HAVING request_count > 0
        ORDER BY request_count DESC
    """, {"since": since_sec})

    if rows is None:
        return []

    total = sum(int(r[1]) for r in rows)
    return [
        {
            "status_class": r[0],
            "request_count": int(r[1]),
            "percentage": round(int(r[1]) * 100.0 / total, 2) if total > 0 else 0.0,
        }
        for r in rows
    ]


def query_time_comparison(
    comparison_type: str = "day_over_day",
    days: int = 7,
) -> dict[str, Any] | list[dict[str, Any]]:
    if comparison_type == "day_over_day":
        return _query_day_over_day()
    elif comparison_type == "hourly_distribution":
        return _query_hourly_distribution(days)
    elif comparison_type == "week_over_week":
        return _query_week_over_week()
    return {}


def _query_day_over_day() -> dict[str, Any]:
    today_rows = execute_query("""
        SELECT max(Value) AS request_count, count(*) AS sample_count
        FROM otel_metrics_sum
        WHERE MetricName = 'edge_http_status'
          AND TimeUnix > toStartOfDay(now())
    """)
    yesterday_rows = execute_query("""
        SELECT max(Value) AS request_count, count(*) AS sample_count
        FROM otel_metrics_sum
        WHERE MetricName = 'edge_http_status'
          AND TimeUnix > toStartOfDay(now()) - INTERVAL 1 DAY
          AND TimeUnix <= toStartOfDay(now())
    """)

    today_count = int(today_rows[0][0]) if today_rows and today_rows[0][0] else 0
    today_samples = int(today_rows[0][1]) if today_rows else 0
    yesterday_count = int(yesterday_rows[0][0]) if yesterday_rows and yesterday_rows[0][0] else 0
    yesterday_samples = int(yesterday_rows[0][1]) if yesterday_rows else 0

    change_rate = 0.0
    if yesterday_count > 0:
        change_rate = round((today_count - yesterday_count) * 100.0 / yesterday_count, 2)

    expected_samples = 1440
    data_quality = "complete" if today_samples >= expected_samples * 0.9 else "partial"

    return {
        "today_requests": today_count,
        "yesterday_requests": yesterday_count,
        "change_rate": change_rate,
        "data_quality": data_quality,
        "today_sample_count": today_samples,
        "yesterday_sample_count": yesterday_samples,
    }


def _query_hourly_distribution(days: int) -> list[dict[str, Any]]:
    rows = execute_query("""
        SELECT
            toHour(TimeUnix) AS hour_of_day,
            toDayOfWeek(TimeUnix) AS day_of_week,
            max(Value) - min(Value) AS request_count
        FROM otel_metrics_sum
        WHERE MetricName = 'edge_http_status'
          AND TimeUnix > now() - INTERVAL %(days)s DAY
        GROUP BY hour_of_day, day_of_week
        ORDER BY day_of_week, hour_of_day
    """, {"days": days})

    if rows is None:
        return []
    return [
        {
            "hour_of_day": int(r[0]),
            "day_of_week": int(r[1]),
            "request_count": int(r[2]),
        }
        for r in rows
    ]


def _query_week_over_week() -> dict[str, Any]:
    this_week_rows = execute_query("""
        SELECT max(Value) AS request_count, count(*) AS sample_count
        FROM otel_metrics_sum
        WHERE MetricName = 'edge_http_status'
          AND TimeUnix > toStartOfWeek(now())
    """)
    last_week_rows = execute_query("""
        SELECT max(Value) AS request_count, count(*) AS sample_count
        FROM otel_metrics_sum
        WHERE MetricName = 'edge_http_status'
          AND TimeUnix > toStartOfWeek(now()) - INTERVAL 7 DAY
          AND TimeUnix <= toStartOfWeek(now())
    """)

    this_week_count = int(this_week_rows[0][0]) if this_week_rows and this_week_rows[0][0] else 0
    this_week_samples = int(this_week_rows[0][1]) if this_week_rows else 0
    last_week_count = int(last_week_rows[0][0]) if last_week_rows and last_week_rows[0][0] else 0
    last_week_samples = int(last_week_rows[0][1]) if last_week_rows else 0

    change_rate = 0.0
    if last_week_count > 0:
        change_rate = round((this_week_count - last_week_count) * 100.0 / last_week_count, 2)

    expected_samples = 10080
    data_quality = "complete" if this_week_samples >= expected_samples * 0.9 else "partial"

    return {
        "this_week_requests": this_week_count,
        "last_week_requests": last_week_count,
        "change_rate": change_rate,
        "data_quality": data_quality,
        "this_week_sample_count": this_week_samples,
        "last_week_sample_count": last_week_samples,
    }


def query_node_health(
    health_type: str = "status",
    status_filter: str | None = None,
) -> list[dict[str, Any]]:
    if health_type == "status":
        return _query_node_status(status_filter)
    elif health_type == "resource":
        return _query_resource_usage()
    return []


def _query_node_status(status_filter: str | None = None) -> list[dict[str, Any]]:
    rows = execute_query("""
        SELECT
            Attributes['ip'] AS node_ip,
            argMax(Value, TimeUnix) AS status,
            max(TimeUnix) AS last_seen
        FROM otel_metrics_gauge
        WHERE MetricName = 'up'
        GROUP BY node_ip
        ORDER BY status ASC, last_seen DESC
    """)

    if rows is None:
        return []

    result = [
        {
            "node_ip": r[0],
            "status": int(r[1]),
            "last_seen": str(r[2]),
        }
        for r in rows
    ]

    if status_filter == "unhealthy":
        result = [r for r in result if r["status"] == 0]
    elif status_filter == "healthy":
        result = [r for r in result if r["status"] == 1]

    return result


def _query_resource_usage() -> list[dict[str, Any]]:
    rows = execute_query("""
        SELECT
            Attributes['name'] AS dict_name,
            Attributes['ip'] AS node_ip,
            argMax(
                CASE WHEN MetricName = 'edge_shared_dict_capacity_bytes' THEN Value END,
                TimeUnix
            ) AS capacity_bytes,
            argMax(
                CASE WHEN MetricName = 'edge_shared_dict_free_space_bytes' THEN Value END,
                TimeUnix
            ) AS free_bytes
        FROM otel_metrics_gauge
        WHERE MetricName IN ('edge_shared_dict_capacity_bytes', 'edge_shared_dict_free_space_bytes')
        GROUP BY dict_name, node_ip
    """)

    if rows is None:
        return []

    result = []
    for r in rows:
        capacity = float(r[2]) if r[2] else 0.0
        free = float(r[3]) if r[3] else 0.0
        usage_percent = round((capacity - free) * 100.0 / capacity, 2) if capacity > 0 else 0.0
        result.append({
            "dict_name": r[0],
            "node_ip": r[1],
            "capacity_bytes": int(capacity),
            "free_bytes": int(free),
            "usage_percent": usage_percent,
        })
    return result
