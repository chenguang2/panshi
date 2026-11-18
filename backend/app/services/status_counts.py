"""列表页「发布状态」三分区的权威计数（filter-architecture 方案甲 / 决策 D4）。

背景：前端曾用 `page_size=500` 的一次抽样在页头算分布（design D3），当总数超过 500 时
标注为总数的这些数字是错的——routes 实测 1596 条时页头「未发布 331」而真实 1421，
「已发布 3」而真实 4。状态 chips 需要可点的筛选 + 可见的计数，计数必须权威。

三分区口径（与列表端点 `publish_status` 过滤**完全同源**，见 routes.py 的说明）：
- unpublished = 无 current_version；
- pending     = 有 current_version 且 updated_at > 该资源最近一次发布时间（存在未下发修改）；
- published   = 其余有 current_version 的（含历史版本已被删光、latest_ts 为空的守卫行）。
三者互斥且穷尽（current_version 为空 → unpublished；否则 pending/published）。

实现是**一条聚合 SQL**（`SUM(CASE ...)`）而非三次 COUNT，避免三次全表扫描；
调用方负责把业务过滤条件（分组/集群/搜索/方法/插件/权限…）加到 query 上，
但**不得**加 `publish_status` 本身的条件——否则其余分区的计数会被筛成 0。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.models.cluster import ConfigVersion


def latest_publish_subquery(resource_type: str):
    """该资源类型「最近一次发布时间」子查询（resource_id → latest_ts）。"""
    return (
        select(
            ConfigVersion.resource_id,
            func.max(ConfigVersion.created_at).label("latest_ts"),
        )
        .where(ConfigVersion.resource_type == resource_type)
        .group_by(ConfigVersion.resource_id)
        .subquery()
    )


async def publish_status_counts(
    db: AsyncSession,
    *,
    model: Any,
    resource_type: str,
    base_filter: Any = None,
) -> dict[str, int]:
    """返回 {total, published, pending, unpublished}。

    `model` 需具备 `id` / `current_version` / `updated_at` 三列（Route、Upstream 均满足）；
    `base_filter` 是调用方构造好的 `select(model)` 查询（含业务过滤条件），
    本函数会把它转成聚合查询。
    """
    latest = latest_publish_subquery(resource_type)
    pending_expr = and_(
        model.current_version.isnot(None),
        model.updated_at > latest.c.latest_ts,
    )
    unpublished_expr = model.current_version.is_(None)

    inner = base_filter if base_filter is not None else select(model)
    # 以调用方查询为子查询源，避免重复维护 where 条件；子查询里补 latest_ts 供三分区判定
    inner = inner.add_columns(latest.c.latest_ts.label("__latest_ts")).outerjoin(
        latest, model.id == latest.c.resource_id
    )
    sub = inner.subquery()

    id_col: InstrumentedAttribute = sub.c[model.id.key]
    version_col = sub.c[model.current_version.key]
    updated_col = sub.c[model.updated_at.key]
    latest_col = sub.c["__latest_ts"]

    pending_sql = and_(version_col.isnot(None), updated_col > latest_col)
    unpublished_sql = version_col.is_(None)

    result = await db.execute(
        select(
            func.count(id_col).label("total"),
            func.coalesce(func.sum(case((pending_sql, 1), else_=0)), 0).label("pending"),
            func.coalesce(func.sum(case((unpublished_sql, 1), else_=0)), 0).label("unpublished"),
        ).select_from(sub)
    )
    row = result.one()
    total = int(row.total or 0)
    pending = int(row.pending or 0)
    unpublished = int(row.unpublished or 0)
    return {
        "total": total,
        "published": max(total - pending - unpublished, 0),
        "pending": pending,
        "unpublished": unpublished,
    }
