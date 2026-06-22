"""Metrics query API endpoints.

Provides read-only access to Edge node metrics stored in ClickHouse via
the esapm OpenTelemetry pipeline.
"""

from fastapi import APIRouter, Query

from app.services.metrics_service import (
    query_metric_names,
    query_time_series,
    query_summary,
)

router = APIRouter(tags=["metrics"])


@router.get("/metrics/names")
async def get_metric_names():
    names = query_metric_names()
    return {"data": names}


@router.get("/metrics/summary")
async def get_metrics_summary():
    data = query_summary()
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
