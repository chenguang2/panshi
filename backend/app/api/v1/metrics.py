"""Metrics query API endpoints.

Provides read-only access to Edge node metrics stored in ClickHouse via
the esapm OpenTelemetry pipeline.

"""

from fastapi import APIRouter, HTTPException, Query

from app.services.metrics_service import (
    query_metric_names,
    query_time_series,
    query_summary,
    query_route_stats,
    query_status_analysis,
    query_time_comparison,
    query_node_health,
)

router = APIRouter(tags=["metrics"])

VALID_ROUTE_STATS_TYPES = {"qps", "bandwidth", "error_rate", "latency"}

@router.get("/metrics/names")
async def get_metric_names():
    names = query_metric_names()
    return {"data": names}


@router.get("/metrics/summary")
async def get_metrics_summary():
    data = query_summary()
    return {"data": data}


@router.get("/metrics/route-stats")
async def get_route_stats(
    stats_type: str = Query("qps"),
    since: str = Query("24h", pattern=r"^\d+[smhd]$"),
    limit: int = Query(10, ge=1, le=100),
    latency_type: str = Query("request"),
):
    if stats_type not in VALID_ROUTE_STATS_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type. Valid: {', '.join(sorted(VALID_ROUTE_STATS_TYPES))}"
        )
    data = query_route_stats(
        stats_type=stats_type,
        since=since,
        limit=limit,
        latency_type=latency_type,
    )
    return {"data": data}


@router.get("/metrics/status-analysis")
async def get_status_analysis(
    since: str = Query("24h", pattern=r"^\d+[smhd]$"),
):
    data = query_status_analysis(since=since)
    return {"data": data}


VALID_COMPARISON_TYPES = {"day_over_day", "hourly_distribution", "week_over_week"}


@router.get("/metrics/time-comparison")
async def get_time_comparison(
    comparison_type: str = Query("day_over_day"),
    days: int = Query(7, ge=1, le=30),
):
    if comparison_type not in VALID_COMPARISON_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type. Valid: {', '.join(sorted(VALID_COMPARISON_TYPES))}"
        )
    data = query_time_comparison(
        comparison_type=comparison_type,
        days=days,
    )
    return {"data": data}


VALID_HEALTH_TYPES = {"status", "resource"}


@router.get("/metrics/node-health")
async def get_node_health(
    health_type: str = Query("status"),
    status: str | None = Query(None),
):
    if health_type not in VALID_HEALTH_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type. Valid: {', '.join(sorted(VALID_HEALTH_TYPES))}"
        )
    data = query_node_health(
        health_type=health_type,
        status_filter=status,
    )
    return {"data": data}


@router.get("/metrics/{metric_name}")
async def get_metric_time_series(
    metric_name: str,
    since: str = Query("1h", pattern=r"^\d+[smhd]$"),
    interval: str = Query("5m", pattern=r"^\d+[sm]$"),
    label: str | None = Query(None),
):
    data = query_time_series(
        metric_name=metric_name,
        since=since,
        interval=interval,
        label=label,
    )
    return {"data": data}
