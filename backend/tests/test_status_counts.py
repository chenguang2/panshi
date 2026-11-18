"""发布状态三分区权威计数（filter-architecture 决策 D4）测试。

背景事故：前端页头分布取自 `page_size=500` 的一次抽样，路由总数 1596 时
「未发布」显示 331 而真实 1421、「已发布」显示 3 而真实 4 —— 抽样当全量。
本文件钉住新的后端聚合口径：
① 三分区互斥且求和 = total；
② counts.total 与同筛选条件下的列表 total 完全一致（分组/集群/方法/搜索/上游/插件/负载均衡）；
③ counts **不受** publish_status 影响（否则点任一 chip 后其余 chip 全变 0）；
④ 非管理员只能看到自己有权限的集群。
"""

import pytest

from app.models.cluster import Cluster, ConfigVersion, Route, Upstream
from app.models.user import User, UserCluster, UserPermission


async def _seed(session_factory):
    """两个集群 + 5 条路由（覆盖三分区）+ 2 个上游。"""
    async with session_factory() as s:
        # cluster 1 由 isolated_app 种子预置（name=test-cluster），此处补 group 名 + 建 cluster 2
        existing = await s.get(Cluster, 1)
        existing.group_name = "g1"
        s.add_all(
            [
                Cluster(id=2, name="c2", display_name="集群二", group_name="g2", status=1),
                Upstream(id=1, name="up-a", cluster_id=1, load_balance="weighted_roundrobin"),
                Upstream(id=2, name="up-b", cluster_id=2, load_balance="chash"),
            ]
        )
        await s.flush()
        # route 1：已发布（有版本 + 有发布时间且 updated_at <= 发布时间）
        s.add(Route(id=1, cluster_id=1, name="r-published", uri="/a", methods="GET", priority=0, status=1, upstream_id=1))
        # route 2/3：待发布（有版本但 updated_at > 最近发布时间）
        s.add(Route(id=2, cluster_id=1, name="r-pending", uri="/b", methods="POST", priority=0, status=1, upstream_id=1))
        # route 4/5：未发布（无版本）
        s.add(Route(id=3, cluster_id=2, name="r-new-1", uri="/c", methods="POST", priority=0, status=1, upstream_id=2))
        s.add(Route(id=4, cluster_id=2, name="r-new-2", uri="/d", methods="GET", priority=0, status=1, upstream_id=2))
        await s.flush()

        # 版本与发布时间：route 1 已发布；route 2 有版本但发布时间早于 updated_at → pending
        from datetime import datetime, timedelta

        old = datetime.utcnow() - timedelta(days=3)
        recent = datetime.utcnow() + timedelta(days=1)  # 比 updated_at 更晚 → 已发布
        s.add_all(
            [
                ConfigVersion(cluster_id=1, resource_type="route", resource_id=1, version=1, config="{}", created_at=recent),
                ConfigVersion(cluster_id=1, resource_type="route", resource_id=2, version=1, config="{}", created_at=old),
                ConfigVersion(cluster_id=2, resource_type="upstream", resource_id=1, version=1, config="{}", created_at=recent),
            ]
        )
        from sqlalchemy import update

        await s.execute(update(Route).where(Route.id == 1).values(current_version=1))
        await s.execute(update(Route).where(Route.id == 2).values(current_version=1))
        await s.execute(update(Upstream).where(Upstream.id == 1).values(current_version=1))
        await s.commit()
        return {"old": old, "recent": recent}


@pytest.mark.asyncio
async def test_route_status_counts_mutually_exclusive_and_sum_to_total(async_authed_client, isolated_session):
    await _seed(isolated_session)
    resp = await async_authed_client.get("/api/v1/routes/status-counts")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert {"total", "published", "pending", "unpublished"} <= set(data)
    assert data["total"] == 4
    assert data["published"] + data["pending"] + data["unpublished"] == data["total"]


@pytest.mark.asyncio
async def test_route_status_counts_match_list_totals_under_same_filters(async_authed_client, isolated_session):
    await _seed(isolated_session)
    cases = [
        {},
        {"cluster_id": 1},
        {"cluster_id": 2},
        {"method": "POST"},
        {"method": "GET"},
        {"search": "pending"},
        {"upstream_id": 2},
        {"group_name": "g2"},
    ]
    for params in cases:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        suffix = f"?{qs}" if qs else ""
        counts = (await async_authed_client.get(f"/api/v1/routes/status-counts{suffix}")).json()
        listing = (await async_authed_client.get(f"/api/v1/routes?page=1&page_size=1{suffix.replace('?', '&')}")).json()
        assert counts["total"] == listing["total"], f"筛选 {params} 下计数与列表总数不一致"


@pytest.mark.asyncio
async def test_route_status_counts_ignore_publish_status_param(async_authed_client, isolated_session):
    """点「待发布」chip 后，其余 chip 的计数不得归零（counts 不吃 publish_status）。"""
    await _seed(isolated_session)
    base = (await async_authed_client.get("/api/v1/routes/status-counts")).json()
    for status_value in ("published", "pending", "unpublished"):
        narrowed = (await async_authed_client.get(f"/api/v1/routes/status-counts?publish_status={status_value}")).json()
        assert narrowed == base, f"publish_status={status_value} 不应改变计数"


@pytest.mark.asyncio
async def test_route_status_counts_partition_matches_status_filter_list(async_authed_client, isolated_session):
    """各分区计数 = 该 publish_status 过滤下的列表 total（口径同源）。"""
    await _seed(isolated_session)
    counts = (await async_authed_client.get("/api/v1/routes/status-counts")).json()
    for key in ("published", "pending", "unpublished"):
        listing = (await async_authed_client.get(f"/api/v1/routes?page=1&page_size=1&publish_status={key}")).json()
        assert counts[key] == listing["total"], f"{key} 分区计数与列表不一致"


@pytest.mark.asyncio
async def test_route_status_counts_respect_cluster_permission(async_authed_client, isolated_session):
    await _seed(isolated_session)
    async with isolated_session() as s:
        s.add(User(id=9, username="op9", password_hash="x", role="operator", status=1))
        # 资源级权限与集群范围正交：operator 需显式授予 routes 才不被 403
        s.add(UserPermission(user_id=9, resource_type="routes", enabled=1))
        s.add(UserCluster(user_id=9, cluster_id=2))
        await s.commit()

    from tests.api_helpers import auth_headers_for

    resp = await async_authed_client.get("/api/v1/routes/status-counts", headers=auth_headers_for(9))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 2  # 只有 cluster 2 的两条
    assert data["unpublished"] == 2


@pytest.mark.asyncio
async def test_upstream_status_counts(async_authed_client, isolated_session):
    await _seed(isolated_session)
    resp = await async_authed_client.get("/api/v1/upstreams/status-counts")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 2
    assert data["published"] == 1  # up-a 有版本且最近发布时间更晚
    assert data["unpublished"] == 1  # up-b 无版本
    assert data["pending"] == 0
    # 页头补充维度（filter-architecture G3-甲）
    assert data["target_count"] == 0  # 种子里未建 UpstreamTarget 行
    assert data["cluster_count"] == 2
    # 与列表同筛选一致
    listing = (await async_authed_client.get("/api/v1/upstreams?page=1&page_size=1&load_balance=chash")).json()
    narrowed = (await async_authed_client.get("/api/v1/upstreams/status-counts?load_balance=chash")).json()
    assert narrowed["total"] == listing["total"] == 1
