"""Metrics query service for ClickHouse data.

Provides high-level query functions that abstract away the OTel schema
(samples_v2 + time_series_v2) and handle Counter vs Gauge distinction.
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


def _is_counter(metric_name: str) -> bool:
    # Check 1: temporality column = 'Cumulative' (native OTel counter)
    rows = execute_query(
        "SELECT 1 FROM esapm_metrics.time_series_v2 "
        "WHERE metric_name = %(name)s AND temporality = 'Cumulative' LIMIT 1",
        {"name": metric_name},
    )
    if rows:
        return True
    # Check 2: labels JSON has __temporality__ = Cumulative
    rows = execute_query(
        "SELECT 1 FROM esapm_metrics.time_series_v2 "
        "WHERE metric_name = %(name)s "
        "AND JSONExtractString(labels, '__temporality__') = 'Cumulative' LIMIT 1",
        {"name": metric_name},
    )
    if rows:
        return True
    # Check 3: Prometheus convention — metric ends with _total
    if metric_name.endswith("_total"):
        return True
    return False


# ── Public API ─────────────────────────────────────────────────────────


def query_metric_names() -> list[str]:
    rows = execute_query(
        "SELECT DISTINCT metric_name FROM esapm_metrics.samples_v2 ORDER BY metric_name"
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
    is_counter = _is_counter(metric_name)

    label_join = ""
    label_where = ""
    if label and ":" in label:
        key, val = label.split(":", 1)
        label_join = (
            "JOIN esapm_metrics.time_series_v2 t "
            "ON s.fingerprint = t.fingerprint AND s.metric_name = t.metric_name"
        )
        label_where = f"AND JSONExtractString(t.labels, '{key}') = '{val}'"

    if is_counter:
        sql = f"""
            SELECT
                toStartOfInterval(toDateTime(intDiv(s.timestamp_ms, 1000)),
                                  INTERVAL {interval_sec} SECOND) AS bucket,
                greatest((max(s.value) - min(s.value)) / %(delta)s, 0) AS rate_val,
                count(*) AS sample_count
            FROM esapm_metrics.samples_v2 s
            {label_join}
            WHERE s.metric_name = %(name)s
              AND s.timestamp_ms > (toUnixTimestamp(now()) - %(since)s) * 1000
              {label_where}
            GROUP BY bucket
            ORDER BY bucket
        """
        params = {"name": metric_name, "since": since_sec, "delta": interval_sec}
        rows = execute_query(sql, params)
        if rows is None:
            return []
        return [
            {
                "metric_name": metric_name,
                "timestamp": int(r[0].timestamp()) if hasattr(r[0], "timestamp") else r[0],
                "avg": max(float(r[1]), 0.0) if r[1] is not None else 0.0,
                "sample_count": r[2],
            }
            for r in rows
            if r[1] is not None
        ]

    # Gauge path
    gauge_label_join = label_join or (
        "JOIN esapm_metrics.time_series_v2 t "
        "ON s.fingerprint = t.fingerprint AND s.metric_name = t.metric_name"
    )
    sql = f"""
        SELECT
            toStartOfInterval(toDateTime(intDiv(s.timestamp_ms, 1000)),
                              INTERVAL {interval_sec} SECOND) AS bucket,
            avg(s.value) AS avg_val,
            max(s.value) AS max_val,
            min(s.value) AS min_val,
            count(*) AS sample_count
        FROM esapm_metrics.samples_v2 s
        {gauge_label_join}
        WHERE s.metric_name = %(name)s
          AND s.timestamp_ms > (toUnixTimestamp(now()) - %(since)s) * 1000
          {label_where}
        GROUP BY bucket
        ORDER BY bucket
    """
    rows = execute_query(sql, {"name": metric_name, "since": since_sec})
    if rows is None:
        return []
    return [
        {
            "metric_name": metric_name,
            "timestamp": int(r[0].timestamp()) if hasattr(r[0], "timestamp") else r[0],
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
            metric_name,
            argMax(value, timestamp_ms) AS latest_value
        FROM esapm_metrics.samples_v2
        WHERE timestamp_ms > (toUnixTimestamp(now()) - 300) * 1000
        GROUP BY metric_name
        ORDER BY metric_name
    """)
    if rows is None:
        return {}
    return {r[0]: float(r[1]) for r in rows}
