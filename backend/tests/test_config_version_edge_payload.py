"""发布快照实发载荷留痕（openspec: config-drift-detection，任务 1.1–1.2）。

publish_resource 落快照时必须把实际发送给 Edge 的载荷（edge_data）一并持久化到
ConfigVersion.edge_payload——它是漂移检测的不可变基线（平台当时「真正发过什么」）。
语义：
- edge_payload 与 config（平台形态快照）同行共存、同版本号；
- edge_data 为 dict/list 时显式 JSON 序列化（#48 TEXT-JSON 铁律）；
- 后续编辑不改变已落快照（不可变基线）。
"""
import json
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.models.cluster import ConfigVersion, Node
from app.services.edge_client import EdgeClient

FAKE_EDGE_OK = {"plugin_config_id": "pc-ok"}


def _publish_patch(captured: dict):
    """mock Edge 网络并捕获实发载荷（edge_data），同时 mock 发布日志文件。"""
    from contextlib import ExitStack

    def _capture_create(resource_id, data):
        # patch.object 类属性 MagicMock 不绑定 self：side_effect 只收调用实参
        captured["edge_data"] = data
        return FAKE_EDGE_OK

    stack = ExitStack()
    stack.enter_context(
        patch.object(EdgeClient, "create_plugin_config", side_effect=_capture_create)
    )
    stack.enter_context(
        patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock())
    )
    return stack


@pytest.fixture
async def seed_node(isolated_session):
    async with isolated_session() as s:
        s.add(Node(cluster_id=1, ip="10.9.1.4", service_port=80,
                   management_port=9180, edge_path="/edge", status=1))
        await s.commit()


class TestEdgePayloadPersisted:
    @pytest.mark.asyncio
    async def test_publish_persists_edge_payload(
        self, async_authed_client, isolated_session, seed_node
    ):
        """发布插件组后最新 ConfigVersion.edge_payload == 实发载荷。"""
        create = await async_authed_client.post(
            "/api/v1/clusters/1/plugin_configs",
            json={"name": "zz-drift-pc", "plugins": {"ip-restriction": {"whitelist": ["10.0.0.1"]}}},
        )
        assert create.status_code in (200, 201), create.text
        pcid = create.json()["id"]

        captured: dict = {}
        with _publish_patch(captured):
            pub = await async_authed_client.post(
                f"/api/v1/clusters/1/plugin_configs/{pcid}/publish"
            )
        assert pub.status_code == 200, pub.text
        assert pub.json()["status"] == "ok"
        assert "edge_data" in captured, "edge_data 未被捕获（打桩点漂移）"

        async with isolated_session() as s:
            cvs = (
                await s.execute(
                    select(ConfigVersion).where(
                        ConfigVersion.resource_type == "plugin_config",
                        ConfigVersion.resource_id == pcid,
                    )
                )
            ).scalars().all()
            assert len(cvs) == 1
            cv = cvs[0]
            # 实发载荷与平台形态快照共存且分别为两种形态
            assert cv.edge_payload is not None, "快照未留存实发载荷"
            assert json.loads(cv.edge_payload) == captured["edge_data"]
            assert cv.config is not None and cv.config != cv.edge_payload

    @pytest.mark.asyncio
    async def test_republish_keeps_distinct_payloads(
        self, async_authed_client, isolated_session, seed_node
    ):
        """两次发布各留各的实发载荷（基线不可变）。"""
        create = await async_authed_client.post(
            "/api/v1/clusters/1/plugin_configs",
            json={"name": "zz-drift-pc2", "plugins": {"ip-restriction": {"whitelist": ["10.0.0.2"]}}},
        )
        pcid = create.json()["id"]

        for whitelist_ip in ("10.0.1.1", "10.0.2.2"):
            edit = await async_authed_client.put(
                f"/api/v1/clusters/1/plugin_configs/{pcid}",
                json={"name": "zz-drift-pc2",
                      "plugins": {"ip-restriction": {"whitelist": [whitelist_ip]}}},
            )
            assert edit.status_code == 200, edit.text
            captured: dict = {}
            with _publish_patch(captured):
                pub = await async_authed_client.post(
                    f"/api/v1/clusters/1/plugin_configs/{pcid}/publish"
                )
            assert pub.status_code == 200, pub.text

        async with isolated_session() as s:
            cvs = (
                await s.execute(
                    select(ConfigVersion).where(
                        ConfigVersion.resource_type == "plugin_config",
                        ConfigVersion.resource_id == pcid,
                    ).order_by(ConfigVersion.version)
                )
            ).scalars().all()
            assert len(cvs) == 2
            payloads = [json.loads(cv.edge_payload) for cv in cvs]
            assert payloads[0] != payloads[1], "两次发布实发载荷应不同"
