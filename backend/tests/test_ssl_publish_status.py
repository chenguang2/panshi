"""SSL 发布状态四态接线（ssl-ux-review-fixes 组 2.1，设计 D1）。

覆盖：
1. 三个端点（全局列表 GET /ssl、集群列表 GET /clusters/{id}/ssl、详情
   GET /clusters/{id}/ssl/{cert_id}）响应携带 pending_publish，经
   edge_sync.derive_pending_publish 单点推导（前端禁止自行按时间戳推导）；
2. 前提钉住（评审问题 5）：真实编辑→true、空保存（无列变更）→false 不变、
   恢复版本→true —— 三条都依赖 SslCertificate.updated_at 的 onupdate，
   该前提被改即红。

范式对照 test_upstream_publish_status.py；SSL 无 partial（无 last_publish_status 列）。
"""
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.models.cluster import ConfigVersion, Node
from app.services.edge_client import EdgeClient

FAKE_EDGE_OK = {"ssl_id": "ok"}


def _publish_patch():
    """同时 mock Edge 网络与发布日志文件（保持测试封闭）。"""
    stack = ExitStack()
    stack.enter_context(patch.object(EdgeClient, "api", return_value=FAKE_EDGE_OK))
    stack.enter_context(
        patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock())
    )
    return stack


async def _create_cert(client, name: str) -> int:
    # 注：cluster_id body 必填是组 8 要修正的契约（D3），此处按现行契约传值
    resp = await client.post(
        "/api/v1/clusters/1/ssl",
        json={
            "name": name,
            "sni": "a.example.com",
            "cert": "CERT-PEM",
            "private_key": "KEY-PEM",
            "cluster_id": 1,
        },
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _fetch_lists(client, cluster_id: int = 1):
    r1 = await client.get("/api/v1/ssl", params={"cluster_id": cluster_id})
    r2 = await client.get(f"/api/v1/clusters/{cluster_id}/ssl")
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    m1 = {i["name"]: i for i in r1.json()["items"]}
    m2 = {i["name"]: i for i in r2.json()["items"]}
    return m1, m2


class TestSslPendingPublishWiring:
    @pytest.mark.asyncio
    async def test_unpublished_cert_pending_false(self, async_authed_client):
        """未发布证书（current_version 为空）：三端点 pending_publish 恒 False。"""
        await _create_cert(async_authed_client, "zz-ssl-unpub")

        m1, m2 = await _fetch_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-ssl-unpub"]["pending_publish"] is False
            assert m["zz-ssl-unpub"]["published_at"] is None

    @pytest.mark.asyncio
    async def test_publish_resets_pending_false_and_backfills_published_at(
        self, async_authed_client, isolated_session
    ):
        """发布成功：三端点 pending_publish False、published_at 回填。"""

        cert_id = await _create_cert(async_authed_client, "zz-ssl-pub")

        m1, m2 = await _fetch_lists(async_authed_client)
        assert m1["zz-ssl-pub"]["pending_publish"] is False

        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.0.3", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            await s.commit()

        with _publish_patch():
            pub = await async_authed_client.post(f"/api/v1/clusters/1/ssl/{cert_id}/publish")
        assert pub.status_code == 200, pub.text

        m1, m2 = await _fetch_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-ssl-pub"]["pending_publish"] is False
            assert m["zz-ssl-pub"]["published_at"] is not None

        detail = await async_authed_client.get(f"/api/v1/clusters/1/ssl/{cert_id}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["pending_publish"] is False
        assert detail.json()["published_at"] is not None

    @pytest.mark.asyncio
    async def test_edit_after_publish_marks_pending_true(
        self, async_authed_client, isolated_session
    ):
        """真实编辑（onupdate 刷 updated_at）：列表 + 详情 pending_publish True。"""

        cert_id = await _create_cert(async_authed_client, "zz-ssl-edit")

        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.0.3", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            await s.commit()

        with _publish_patch():
            assert (
                await async_authed_client.post(f"/api/v1/clusters/1/ssl/{cert_id}/publish")
            ).status_code == 200

        put = await async_authed_client.put(
            f"/api/v1/clusters/1/ssl/{cert_id}", json={"description": "改过配置"}
        )
        assert put.status_code == 200, put.text

        m1, m2 = await _fetch_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-ssl-edit"]["pending_publish"] is True

        detail = await async_authed_client.get(f"/api/v1/clusters/1/ssl/{cert_id}")
        assert detail.json()["pending_publish"] is True

    @pytest.mark.asyncio
    async def test_empty_save_keeps_pending_false(
        self, async_authed_client, isolated_session
    ):
        """前提钉住：空保存（无列变更，SQLAlchemy 跳过 UPDATE）→ pending 不误报。"""

        cert_id = await _create_cert(async_authed_client, "zz-ssl-nosave")

        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.0.3", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            await s.commit()

        with _publish_patch():
            assert (
                await async_authed_client.post(f"/api/v1/clusters/1/ssl/{cert_id}/publish")
            ).status_code == 200

        # 与当前值相同的 description：无列变更 → 不触发 onupdate
        put = await async_authed_client.put(
            f"/api/v1/clusters/1/ssl/{cert_id}", json={"description": None}
        )
        assert put.status_code == 200, put.text

        async with isolated_session() as s:
            from app.models.ssl import SslCertificate

            cert = await s.get(SslCertificate, cert_id)
            cvs = (
                await s.execute(
                    select(ConfigVersion).where(
                        ConfigVersion.resource_type == "ssl",
                        ConfigVersion.resource_id == cert_id,
                    )
                )
            ).scalars().all()
            assert len(cvs) == 1
            assert cert.updated_at == cvs[0].created_at, (
                "updated_at onupdate 前提被破坏：空保存竟刷新了 updated_at"
            )

        m1, m2 = await _fetch_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-ssl-nosave"]["pending_publish"] is False

    @pytest.mark.asyncio
    async def test_rollback_marks_pending_true(self, async_authed_client, isolated_session):
        """前提钉住：恢复版本（onupdate 刷 updated_at）→ pending True（修复恢复后恒「已发布」盲区）。"""

        cert_id = await _create_cert(async_authed_client, "zz-ssl-rollback")

        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.0.3", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            await s.commit()

        with _publish_patch():
            assert (
                await async_authed_client.post(f"/api/v1/clusters/1/ssl/{cert_id}/publish")
            ).status_code == 200
            assert (
                await async_authed_client.post(f"/api/v1/clusters/1/ssl/{cert_id}/publish")
            ).status_code == 200

        rb = await async_authed_client.post(f"/api/v1/clusters/1/ssl/{cert_id}/rollback/1")
        assert rb.status_code == 200, rb.text

        m1, m2 = await _fetch_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-ssl-rollback"]["pending_publish"] is True
