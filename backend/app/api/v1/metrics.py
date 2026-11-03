"""Metrics query API endpoints.

Provides read-only access to Edge node metrics stored in ClickHouse via
the esapm OpenTelemetry pipeline.

"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.cluster import Node
from app.services.metrics_service import (
    parse_filter,
    query_avg_latency_series,
    query_fast_ratio_bucket_stats,
    query_fast_ratio_series,
    query_metric_names,
    query_time_series,
    query_summary,
    query_connection_states,
    query_route_stats,
    query_status_analysis,
    query_time_comparison,
    query_node_health,
)
from app.services import clickhouse_client as ch
from app.services.clickhouse_client import execute_query

from app.core.deps import require_permission

router = APIRouter(tags=["metrics"], dependencies=[Depends(require_permission('metrics'))])

VALID_ROUTE_STATS_TYPES = {"qps", "bandwidth", "error_rate", "latency"}


async def _resolve_filter(
    filter_str: str | None, db: AsyncSession
) -> tuple[list[str] | None, str | None]:
    """解析 filter 参数为上报节点 ip 集合（metrics-cluster-node-filter D1/D2）。

    - cluster:{id} → ps_node 该集群节点 ip（含禁用节点：采集端不因平台禁用停报）
    - node:{ip} → [ip]
    - unmanaged → 近 24h 上报 ip 集 − 平台节点 ip 集
    - 解析失败/集群不存在 → (None, warning)，端点静默回退全部视角
    """
    parsed = parse_filter(filter_str)  # ValueError → 调用方转 400
    if parsed is None:
        return None, None
    kind, value = parsed
    if kind == "cluster":
        rows = await db.execute(select(Node.ip).where(Node.cluster_id == int(value)))
        ips = [r[0] for r in rows.all()]
        if not ips:
            return None, f"集群 {value} 不存在或无节点，已回退全部视角"
        return ips, None
    if kind == "node":
        return [value], None
    # unmanaged：近期上报 − 平台节点（两查询各一次，差集在 Python 侧算）
    recent = await asyncio.to_thread(
        execute_query,
        "SELECT DISTINCT Attributes['ip'] FROM otel_metrics_gauge "
        "WHERE MetricName = 'up' AND TimeUnix > now() - INTERVAL 86400 SECOND",
    )
    platform_rows = await db.execute(select(Node.ip))
    platform = {r[0] for r in platform_rows.all()}
    return sorted({r[0] for r in recent or [] if r[0]} - platform), None


def _filter_response(data, warning: str | None = None):
    resp: dict = {"data": data}
    if warning:
        resp["warning"] = warning
    return resp

@router.get("/metrics/names")
async def get_metric_names():
    names = await asyncio.to_thread(query_metric_names)
    return {"data": names}


@router.get("/metrics/summary")
async def get_metrics_summary(
    filter_str: str | None = Query(None, alias="filter"),
    db: AsyncSession = Depends(get_db),
):
    # summary 特例（design D3）：仅 connectionStates 随筛选；summary 值与 source_ok
    # 是连接级/跨页共享语义（指标查询页同源），不随筛选
    try:
        ips, warning = await _resolve_filter(filter_str, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data, source_ok = await asyncio.to_thread(query_summary)
    connection_states = await asyncio.to_thread(query_connection_states, ips=ips)
    resp: dict = {"data": data, "connection_states": connection_states,
                  "source_ok": source_ok, "source": ch.active_target()}
    if warning:
        resp["warning"] = warning
    return resp


@router.get("/metrics/route-stats")
async def get_route_stats(
    stats_type: str = Query("qps"),
    since: str = Query("24h", pattern=r"^\d+[smhd]$"),
    limit: int = Query(10, ge=1, le=100),
    latency_type: str = Query("request"),
    filter_str: str | None = Query(None, alias="filter"),
    db: AsyncSession = Depends(get_db),
):
    if stats_type not in VALID_ROUTE_STATS_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type. Valid: {', '.join(sorted(VALID_ROUTE_STATS_TYPES))}"
        )
    try:
        ips, warning = await _resolve_filter(filter_str, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data = await asyncio.to_thread(
        query_route_stats,
        stats_type=stats_type,
        since=since,
        limit=limit,
        latency_type=latency_type,
        ips=ips,
    )
    return _filter_response(data, warning)


@router.get("/metrics/status-analysis")
async def get_status_analysis(
    since: str = Query("24h", pattern=r"^\d+[smhd]$"),
    filter_str: str | None = Query(None, alias="filter"),
    db: AsyncSession = Depends(get_db),
):
    try:
        ips, warning = await _resolve_filter(filter_str, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data = await asyncio.to_thread(query_status_analysis, since=since, ips=ips)
    return _filter_response(data, warning)


VALID_COMPARISON_TYPES = {"day_over_day", "hourly_distribution", "week_over_week"}


@router.get("/metrics/time-comparison")
async def get_time_comparison(
    comparison_type: str = Query("day_over_day"),
    days: int = Query(7, ge=1, le=30),
    filter_str: str | None = Query(None, alias="filter"),
    db: AsyncSession = Depends(get_db),
):
    if comparison_type not in VALID_COMPARISON_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type. Valid: {', '.join(sorted(VALID_COMPARISON_TYPES))}"
        )
    try:
        ips, warning = await _resolve_filter(filter_str, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data = await asyncio.to_thread(
        query_time_comparison,
        comparison_type=comparison_type,
        days=days,
        ips=ips,
    )
    return _filter_response(data, warning)


VALID_HEALTH_TYPES = {"status", "resource"}


@router.get("/metrics/avg-latency")
async def get_avg_latency(
    since: str = Query("1h", pattern=r"^\d+[smhd]$"),
    interval: str = Query("5m", pattern=r"^\d+[smh]$"),
    filter_str: str | None = Query(None, alias="filter"),
    db: AsyncSession = Depends(get_db),
):
    try:
        ips, warning = await _resolve_filter(filter_str, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    result = await asyncio.to_thread(
        query_avg_latency_series,
        "edge_http_latency",
        since=since,
        interval=interval,
        ips=ips,
    )
    resp = _filter_response(result["points"], warning)
    # 头部窗口聚合口径（design D13）：与快速响应占比卡同约定
    resp["window_avg_ms"] = result.get("window_avg_ms")
    return resp


@router.get("/metrics/fast-ratio")
async def get_fast_ratio(
    since: str = Query("1h", pattern=r"^\d+[smhd]$"),
    interval: str = Query("5m", pattern=r"^\d+[smh]$"),
    filter_str: str | None = Query(None, alias="filter"),
    threshold_ms: float | None = Query(None, gt=0, le=600000),
    db: AsyncSession = Depends(get_db),
):
    """快速响应占比（metrics-fast-ratio-card）。

    响应信封：`data` = 占比点数组，`threshold_ms` = 生效阈值（桶边界），
    `bounds` = 可选阈值枚举（下拉选项来源，读数据不硬编码），
    `bucket_stats` = 各桶区间占比/计数（design D9，2026-11-03 扩展；窗口无请求为 null）。
    """
    try:
        ips, warning = await _resolve_filter(filter_str, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        result = await asyncio.to_thread(
            query_fast_ratio_series,
            "edge_http_latency",
            since=since,
            interval=interval,
            threshold_ms=threshold_ms,
            ips=ips,
        )
    except ValueError as e:
        # 阈值不在桶边界上（桶内不可精确统计）
        raise HTTPException(status_code=400, detail=str(e))
    resp = _filter_response(result["points"], warning)
    resp["threshold_ms"] = result["threshold_ms"]
    resp["bounds"] = result["bounds"]
    # 头部窗口聚合口径（design D13）：与分布条同源，替代「最近一桶」语义
    resp["window_ratio"] = result.get("window_ratio")
    # 区间分布（D9）：复用 series 已取的 bounds；分布与阈值无关，随同一响应返回
    resp["bucket_stats"] = await asyncio.to_thread(
        query_fast_ratio_bucket_stats,
        "edge_http_latency",
        since=since,
        interval=interval,
        ips=ips,
        bounds=result["bounds"],
    )
    return resp


@router.get("/metrics/node-health")
async def get_node_health(
    health_type: str = Query("status"),
    status: str | None = Query(None),
    filter_str: str | None = Query(None, alias="filter"),
    db: AsyncSession = Depends(get_db),
):
    if health_type not in VALID_HEALTH_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type. Valid: {', '.join(sorted(VALID_HEALTH_TYPES))}"
        )
    try:
        ips, warning = await _resolve_filter(filter_str, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data = await asyncio.to_thread(
        query_node_health,
        health_type=health_type,
        status_filter=status,
        ips=ips,
    )
    return _filter_response(data, warning)


@router.get("/metrics/{metric_name}")
async def get_metric_time_series(
    metric_name: str,
    since: str = Query("1h", pattern=r"^\d+[smhd]$"),
    interval: str = Query("5m", pattern=r"^\d+[smh]$"),
    label: str | None = Query(None),
    filter_str: str | None = Query(None, alias="filter"),
    db: AsyncSession = Depends(get_db),
):
    try:
        ips, warning = await _resolve_filter(filter_str, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data = await asyncio.to_thread(
        query_time_series,
        metric_name=metric_name,
        since=since,
        interval=interval,
        label=label,
        ips=ips,
    )
    return _filter_response(data, warning)
