"""四层代理发布状态四态接线（stream-proxy-ux-review-fixes 批 2 / design D2）。

完全复刻 upstream 模式（test_upstream_publish_status.py / edge_sync 单点推导）：
- StreamProxy 新增 last_publish_status 列（须登记 COLUMN_MIGRATIONS，约定 #118）；
- 列表（全局/集群）与详情响应携带 pending_publish（derive_pending_publish 推导）
  与 last_publish_status（模型列透传）；
- publish/rollback 侧零改动——edge_sync 已按 hasattr 能力探测写 partial/清空。
"""
from contextlib import ExitStack
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.models.cluster import Node
from app.services.edge_client import EdgeClient

FAKE_EDGE_OK = {"route_id": "ok"}


async def _create_proxy(client, name: str, port: int) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/stream-proxies",
        json={
            "name": name,
            "listen_port": port,
            "scheme": "tcp",
            "proxy_type": "normal",
            "load_balance": "roundrobin",
            "targets": [{"target": "10.0.0.1:80", "weight": 100}],
            "cluster_id": 1,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _add_node(session, ip: str) -> None:
    async with session() as s:
        s.add(Node(cluster_id=1, ip=ip, service_port=80, management_port=9180, edge_path="/edge", status=1))
        await s.commit()


def _publish_patch(side_effect=None):
    stack = ExitStack()
    mock = MagicMock(side_effect=side_effect) if side_effect else MagicMock(return_value=FAKE_EDGE_OK)
    stack.enter_context(patch.object(EdgeClient, "api", mock))
    stack.enter_context(patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()))
    return stack


async def _publish(client, proxy_id: int) -> None:
    resp = await client.post(f"/api/v1/clusters/1/stream-proxies/{proxy_id}/publish", json={})
    assert resp.status_code == 200, resp.text


async def _fetch(client, proxy_id: int) -> tuple[dict, dict, dict]:
    r1 = await client.get("/api/v1/stream-proxies", params={"cluster_id": 1})
    r2 = await client.get("/api/v1/clusters/1/stream-proxies")
    r3 = await client.get(f"/api/v1/clusters/1/stream-proxies/{proxy_id}")
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    assert r3.status_code == 200, r3.text
    m1 = {i["name"]: i for i in r1.json()["items"]}
    m2 = {i["name"]: i for i in r2.json()["items"]}
    return m1, m2, r3.json()


class TestStreamPublishFourState:
    @pytest.mark.asyncio
    async def test_unpublished_pending_false(self, async_authed_client):
        """未发布（current_version 空）：pending_publish 恒 False，last_publish_status None。"""
        pid = await _create_proxy(async_authed_client, "zz-st-unpub", 19301)

        m1, m2, detail = await _fetch(async_authed_client, pid)
        for item in (m1["zz-st-unpub"], m2["zz-st-unpub"], detail):
            assert item["pending_publish"] is False
            assert item["last_publish_status"] is None

    @pytest.mark.asyncio
    async def test_published_pending_false(self, async_authed_client, isolated_session):
        """发布成功：pending False，last_publish_status None。"""
        proxy_id = await _create_proxy(async_authed_client, "zz-st-pub", 19302)
        await _add_node(isolated_session, "10.9.0.11")

        with _publish_patch():
            await _publish(async_authed_client, proxy_id)

        m1, m2, detail = await _fetch(async_authed_client, proxy_id)
        for item in (m1["zz-st-pub"], m2["zz-st-pub"], detail):
            assert item["pending_publish"] is False
            assert item["last_publish_status"] is None
            assert item["current_version"] is not None

    @pytest.mark.asyncio
    async def test_edit_after_publish_pending_true(self, async_authed_client, isolated_session):
        """已发布后编辑：pending_publish True（待发布），三端点一致。"""
        proxy_id = await _create_proxy(async_authed_client, "zz-st-edit", 19303)
        await _add_node(isolated_session, "10.9.0.12")

        with _publish_patch():
            await _publish(async_authed_client, proxy_id)

        put = await async_authed_client.put(
            f"/api/v1/clusters/1/stream-proxies/{proxy_id}",
            json={"name": "zz-st-edit", "description": "edited"},
        )
        assert put.status_code == 200, put.text

        m1, m2, detail = await _fetch(async_authed_client, proxy_id)
        for item in (m1["zz-st-edit"], m2["zz-st-edit"], detail):
            assert item["pending_publish"] is True

    @pytest.mark.asyncio
    async def test_rollback_clears_publish_status(self, async_authed_client, isolated_session):
        """回滚：last_publish_status 清空（回滚即视为未完全发布），pending True。"""
        proxy_id = await _create_proxy(async_authed_client, "zz-st-rb", 19304)
        await _add_node(isolated_session, "10.9.0.13")

        with _publish_patch():
            await _publish(async_authed_client, proxy_id)

        async with isolated_session() as s:
            from app.models.cluster import StreamProxy

            sp = await s.get(StreamProxy, proxy_id)
            sp.last_publish_status = "partial"
            # 直接播种会触发 updated_at onupdate；显式给早于发布时间的时间戳
            # （partial 与 pending 两态正交的前提，姊妹域同款处理）
            sp.updated_at = datetime.utcnow() - timedelta(hours=1)
            await s.commit()

        rb = await async_authed_client.post(f"/api/v1/clusters/1/stream-proxies/{proxy_id}/rollback/1")
        assert rb.status_code == 200, rb.text

        m1, m2, detail = await _fetch(async_authed_client, proxy_id)
        for item in (m1["zz-st-rb"], m2["zz-st-rb"], detail):
            assert item["last_publish_status"] is None
            assert item["pending_publish"] is True

    @pytest.mark.asyncio
    async def test_partial_status_surfaces_in_responses(self, async_authed_client, isolated_session):
        """partial 态读出契约（写入由 edge_sync 既有能力探测自测覆盖，姊妹域同约定）。"""
        proxy_id = await _create_proxy(async_authed_client, "zz-st-partial", 19305)
        await _add_node(isolated_session, "10.9.0.14")

        with _publish_patch():
            await _publish(async_authed_client, proxy_id)

        async with isolated_session() as s:
            from app.models.cluster import StreamProxy

            sp = await s.get(StreamProxy, proxy_id)
            sp.last_publish_status = "partial"
            # 直接播种会触发 updated_at onupdate；显式给早于发布时间的时间戳
            # （partial 与 pending 两态正交的前提，姊妹域同款处理）
            sp.updated_at = datetime.utcnow() - timedelta(hours=1)
            await s.commit()

        m1, m2, detail = await _fetch(async_authed_client, proxy_id)
        for item in (m1["zz-st-partial"], m2["zz-st-partial"], detail):
            assert item["last_publish_status"] == "partial"
            # partial 是前端四态判定的另一输入，不改变 pending 布尔（两态正交）
            assert item["pending_publish"] is False


class TestColumnMigrationRegistered:
    def test_last_publish_status_registered(self):
        """约定 #118：新列必须登记 COLUMN_MIGRATIONS，否则启动 crash-loop。"""
        from app.core.migrate import COLUMN_MIGRATIONS

        assert ("ps_stream_proxy", "last_publish_status", "VARCHAR(16)") in COLUMN_MIGRATIONS
