"""路由发布状态四态接线（openspec: route-management-ux-batch1，tasks 4.1 / 4.5）。

覆盖 specs/publish-badges + specs/route-management delta 的后端部分（范式照抄
test_upstream_publish_status.py，upstream-publish-status 的路由版）：
1. 4.1 — route 列表响应（独立页 GET /routes 与 Tab GET /clusters/{id}/routes 两个
   列表入口）经 route_to_response 单序列化点返回 pending_publish
   （edge_sync.derive_pending_publish 推导，与 cluster_upstreams.py 同款）；
2. B1 — GET /clusters/{id}/routes/{id} 详情端点【有意】不推导发布状态
   （pending_publish 恒 False），发布状态展示只走列表；
3. 4.5 — publish_status 筛选互斥三分区（A3 已裁决）：
   published = 有 current_version 且非 pending；
   pending   = 有 current_version 且 pending；
   unpublished = 无 current_version（既有语义不变）。
   SHALL NOT 重叠命中。既有「已发布」= 存在任意 ConfigVersion 的行为改变属已裁决。
"""
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.models.cluster import ConfigVersion, Node, Route
from app.services.edge_client import EdgeClient


PUB_TS = datetime(2026, 1, 1, 12, 0, 0)

FAKE_EDGE_OK = {"route_id": "r-ok"}


def _publish_patch():
    """同时 mock Edge 网络与发布日志文件（保持测试封闭，同 upstream 范式）。"""
    from contextlib import ExitStack

    stack = ExitStack()
    stack.enter_context(
        patch.object(EdgeClient, "update_route", return_value=FAKE_EDGE_OK)
    )
    stack.enter_context(
        patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock())
    )
    return stack


async def _create_route(client, name: str) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/routes", json={"name": name, "uri": f"/{name}/*"}
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _fetch_both_lists(client):
    """返回 (独立页列表 by name, Tab 列表 by name)。"""
    r1 = await client.get("/api/v1/routes", params={"page_size": 200})
    r2 = await client.get("/api/v1/clusters/1/routes", params={"page_size": 200})
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    m1 = {i["name"]: i for i in r1.json()["items"]}
    m2 = {i["name"]: i for i in r2.json()["items"]}
    return m1, m2


# ═══════════════════════════════════════════════════════════════════
# 4.1 发布完成对齐时间戳 + 编辑/回滚推进 pending
# ═══════════════════════════════════════════════════════════════════
class TestRoutePublishAlignsUpdatedAt:
    async def test_publish_pins_updated_at_and_lists_show_published(
        self, async_authed_client, isolated_session
    ):
        """发布成功后两列表入口 pending_publish=False 且 published_at 可见。"""
        # 活跃节点：走真实节点循环（no_nodes 早退不经节点循环）
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.0.3", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            await s.commit()

        rid = await _create_route(async_authed_client, "zz-pin-r")

        with _publish_patch():
            pub = await async_authed_client.post(
                f"/api/v1/clusters/1/routes/{rid}/publish"
            )
        assert pub.status_code == 200, pub.text

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-pin-r"]["pending_publish"] is False
            assert m["zz-pin-r"]["published_at"] is not None
            assert m["zz-pin-r"]["current_version"] == 1

    async def test_edit_after_publish_marks_pending(
        self, async_authed_client, isolated_session
    ):
        """编辑保存（onupdate 刷新 updated_at）→ 待发布，两列表入口一致。"""
        rid = await _create_route(async_authed_client, "zz-edit-r")

        with _publish_patch():
            assert (
                await async_authed_client.post(f"/api/v1/clusters/1/routes/{rid}/publish")
            ).status_code == 200

        put = await async_authed_client.put(
            f"/api/v1/clusters/1/routes/{rid}", json={"description": "改过配置"}
        )
        assert put.status_code == 200, put.text

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-edit-r"]["pending_publish"] is True

    async def test_rollback_after_publish_marks_pending(
        self, async_authed_client, isolated_session
    ):
        """版本恢复刷新 updated_at → 自然推导为待发布（恢复不自动发布的引导态）。"""
        rid = await _create_route(async_authed_client, "zz-rollback-r")

        with _publish_patch():
            assert (
                await async_authed_client.post(f"/api/v1/clusters/1/routes/{rid}/publish")
            ).status_code == 200
            assert (
                await async_authed_client.post(f"/api/v1/clusters/1/routes/{rid}/publish")
            ).status_code == 200

        rb = await async_authed_client.post(
            f"/api/v1/clusters/1/routes/{rid}/rollback/1"
        )
        assert rb.status_code == 200, rb.text

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-rollback-r"]["pending_publish"] is True


# ═══════════════════════════════════════════════════════════════════
# 4.1 两个列表端点四态 + B1 详情端点有意不推导
# ═══════════════════════════════════════════════════════════════════
async def _seed_status_rows(session_factory):
    """播种未发布/待发布/已发布/删光守卫 四种路由（cluster 1）。"""
    t0 = datetime(2026, 1, 1, 0, 0, 0)
    t1 = t0 + timedelta(hours=1)

    def _route(name, *, current_version=None, updated_at=None):
        return Route(
            cluster_id=1,
            name=name,
            uri=f"/{name}/*",
            current_version=current_version,
            updated_at=updated_at,
        )

    async with session_factory() as s:
        rows = [
            _route("zz-st-unpub"),
            _route("zz-st-pending", current_version=1, updated_at=t1),
            _route("zz-st-pub", current_version=2, updated_at=t1),
            _route("zz-st-guard", current_version=5, updated_at=t1),
        ]
        s.add_all(rows)
        await s.flush()
        versions = [
            ConfigVersion(cluster_id=1, resource_type="route", resource_id=rows[1].id, version=1, config="{}", created_at=t0),
            ConfigVersion(cluster_id=1, resource_type="route", resource_id=rows[2].id, version=1, config="{}", created_at=t0),
            ConfigVersion(cluster_id=1, resource_type="route", resource_id=rows[2].id, version=2, config="{}", created_at=t1),
            # rows[3]（守卫行）故意无任何 ConfigVersion：current_version 非空但历史被删光
        ]
        s.add_all(versions)
        await s.commit()
        return {r.name: r.id for r in rows}


class TestRouteListPendingPublish:
    async def test_states_on_both_endpoints(self, async_authed_client, isolated_session):
        await _seed_status_rows(isolated_session)

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            # 未发布：current_version 为空
            assert m["zz-st-unpub"]["pending_publish"] is False
            assert m["zz-st-unpub"]["published_at"] is None
            # 待发布：updated_at > published_at
            assert m["zz-st-pending"]["pending_publish"] is True
            assert m["zz-st-pending"]["published_at"] is not None
            # 已发布：updated_at == published_at
            assert m["zz-st-pub"]["pending_publish"] is False

    async def test_deleted_version_history_guard(self, async_authed_client, isolated_session):
        """current_version 非空但版本记录删光 → 200 + pending=False，绝不 500。"""
        await _seed_status_rows(isolated_session)

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-st-guard"]["pending_publish"] is False
            assert m["zz-st-guard"]["published_at"] is None

    async def test_detail_endpoint_intentionally_skips_derivation(
        self, async_authed_client, isolated_session
    ):
        """B1：详情端点有意不推导发布状态——待发布路由的详情 pending_publish 恒 False。"""
        ids = await _seed_status_rows(isolated_session)

        resp = await async_authed_client.get(f"/api/v1/clusters/1/routes/{ids['zz-st-pending']}")
        assert resp.status_code == 200, resp.text
        assert resp.json()["pending_publish"] is False


# ═══════════════════════════════════════════════════════════════════
# 4.5 publish_status 筛选互斥三分区（A3，published 语义变化）
# ═══════════════════════════════════════════════════════════════════
class TestPublishStatusFilterPartition:
    async def _filtered_names(self, client, status: str) -> set[str]:
        resp = await client.get(
            "/api/v1/routes", params={"page_size": 200, "publish_status": status}
        )
        assert resp.status_code == 200, resp.text
        return {i["name"] for i in resp.json()["items"]}

    async def test_partition_is_mutually_exclusive(self, async_authed_client, isolated_session):
        """三个分区两两不相交，且并集覆盖全部路由（互斥三分区）。"""
        await _seed_status_rows(isolated_session)

        published = await self._filtered_names(async_authed_client, "published")
        pending = await self._filtered_names(async_authed_client, "pending")
        unpublished = await self._filtered_names(async_authed_client, "unpublished")

        assert not (published & pending), f"published/pending 重叠: {published & pending}"
        assert not (published & unpublished), f"published/unpublished 重叠: {published & unpublished}"
        assert not (pending & unpublished), f"pending/unpublished 重叠: {pending & unpublished}"
        assert published | pending | unpublished == {
            "zz-st-unpub", "zz-st-pending", "zz-st-pub", "zz-st-guard",
        }

    async def test_pending_partition_hits_only_pending(self, async_authed_client, isolated_session):
        """pending = 有 current_version 且存在未下发修改。"""
        await _seed_status_rows(isolated_session)

        pending = await self._filtered_names(async_authed_client, "pending")
        assert pending == {"zz-st-pending"}

    async def test_published_partition_excludes_pending(self, async_authed_client, isolated_session):
        """published = 有 current_version 且无待发修改（既有「任意版本即已发布」语义作废）。

        守卫行（版本删光，pending 推导 False）落在 published——A3 按
        「有 current_version 且非 pending」分区的直接推论。
        """
        await _seed_status_rows(isolated_session)

        published = await self._filtered_names(async_authed_client, "published")
        assert published == {"zz-st-pub", "zz-st-guard"}

    async def test_unpublished_partition_unchanged(self, async_authed_client, isolated_session):
        """unpublished = 无 current_version（既有语义不变）。"""
        await _seed_status_rows(isolated_session)

        unpublished = await self._filtered_names(async_authed_client, "unpublished")
        assert unpublished == {"zz-st-unpub"}
