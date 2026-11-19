"""republish-failed-nodes 方案 B（D10/D11/D12）：失败明细持久化与透出。

覆盖：
1. 五类资源全局列表端点透出**解析后**的 last_publish_detail（str→dict schema 边界，#48 同款）；
2. 手动构造响应的两端点（/routes、/plugin_metadata）同款透出；
3. `cluster_backup._entity_kwargs` 统一丢弃运行态发布状态（D12：导入不继承，
   含顺带修复的其他分支 last_publish_status 泄漏）；
4. parse_publish_detail 共享解析器边界（损坏/空/非 dict）。

写回/清除路径（partial 落明细、成功/回滚清空）由 test_global_rule_publish_status.py
钉死（publish_resource hasattr 单点，kind 无关）。
"""

import json

import pytest

from app.schemas.publish_detail import parse_publish_detail
from app.services.cluster_backup import _entity_kwargs

pytestmark = pytest.mark.asyncio


def _detail_json(node: str = "10.0.0.9:9180", error: str = "Edge API error 403: 目标不在该局网关白名单") -> str:
    return json.dumps(
        {"total": 3, "success": 2, "failed": 1, "failed_nodes": [{"node": node, "error": error}], "route": None},
        ensure_ascii=False,
    )


class TestParsePublishDetail:
    def test_valid_json_object(self):
        assert parse_publish_detail(_detail_json())["failed"] == 1

    def test_empty_and_garbage(self):
        assert parse_publish_detail(None) is None
        assert parse_publish_detail("") is None
        assert parse_publish_detail("not-json") is None
        assert parse_publish_detail("[1,2]") is None  # 非 dict

    def test_passthrough_dict(self):
        assert parse_publish_detail({"failed": 1}) == {"failed": 1}


class TestListEndpointsExposeParsedDetail:
    async def test_stream_proxies_global_list(self, async_authed_client, isolated_session):
        from app.models.cluster import StreamProxy

        async with isolated_session() as s:
            s.add(StreamProxy(
                cluster_id=1, name="zz-detail-sp", listen_port=29301, proxy_type="normal",
                current_version=1, last_publish_status="partial",
                last_publish_detail=_detail_json(),
            ))
            await s.commit()

        res = await async_authed_client.get("/api/v1/stream-proxies", params={"search": "zz-detail-sp"})
        assert res.status_code == 200, res.text
        item = next(i for i in res.json()["items"] if i["name"] == "zz-detail-sp")
        assert isinstance(item["last_publish_detail"], dict)
        assert item["last_publish_detail"]["failed_nodes"][0]["error"].startswith("Edge API error 403")

    async def test_routes_global_list(self, async_authed_client, isolated_session):
        from app.models.cluster import Route

        async with isolated_session() as s:
            s.add(Route(
                cluster_id=1, name="zz-detail-route", uri="/zz-detail/*",
                current_version=1, last_publish_status="partial",
                last_publish_detail=_detail_json(),
            ))
            await s.commit()

        res = await async_authed_client.get("/api/v1/routes", params={"search": "zz-detail-route"})
        assert res.status_code == 200, res.text
        item = next(i for i in res.json()["items"] if i["name"] == "zz-detail-route")
        assert isinstance(item["last_publish_detail"], dict)
        assert item["last_publish_detail"]["total"] == 3

    async def test_plugin_configs_global_list(self, async_authed_client, isolated_session):
        from app.models.cluster import PluginConfig

        async with isolated_session() as s:
            s.add(PluginConfig(
                cluster_id=1, name="zz-detail-pc", edge_uuid="zz-detail-pc-uuid",
                plugins="{}",
                current_version=1, last_publish_status="partial",
                last_publish_detail=_detail_json(),
            ))
            await s.commit()

        res = await async_authed_client.get("/api/v1/plugin_configs", params={"search": "zz-detail-pc"})
        assert res.status_code == 200, res.text
        item = next(i for i in res.json()["items"] if i["name"] == "zz-detail-pc")
        assert isinstance(item["last_publish_detail"], dict)

    async def test_global_rules_global_list(self, async_authed_client, isolated_session):
        from app.models.cluster import GlobalRule

        async with isolated_session() as s:
            s.add(GlobalRule(
                cluster_id=1, name="zz-detail-gr",
                current_version=1, last_publish_status="partial",
                last_publish_detail=_detail_json(),
            ))
            await s.commit()

        res = await async_authed_client.get("/api/v1/global_rules", params={"search": "zz-detail-gr"})
        assert res.status_code == 200, res.text
        item = next(i for i in res.json()["items"] if i["name"] == "zz-detail-gr")
        assert isinstance(item["last_publish_detail"], dict)

    async def test_plugin_metadata_global_list(self, async_authed_client, isolated_session):
        from app.models.cluster import PluginMetadata

        async with isolated_session() as s:
            s.add(PluginMetadata(
                cluster_id=1, plugin_name="zz-detail-md", config_data="{}",
                current_version=1, last_publish_status="partial",
                last_publish_detail=_detail_json(),
            ))
            await s.commit()

        res = await async_authed_client.get("/api/v1/plugin_metadata", params={"search": "zz-detail-md"})
        assert res.status_code == 200, res.text
        item = next(i for i in res.json()["items"] if i["plugin_name"] == "zz-detail-md")
        assert isinstance(item["last_publish_detail"], dict)

    async def test_null_detail_stays_none(self, async_authed_client, isolated_session):
        """未失败资源：字段透出为 None（不报错、非空串）。"""
        from app.models.cluster import GlobalRule

        async with isolated_session() as s:
            s.add(GlobalRule(cluster_id=1, name="zz-nodetail-gr"))
            await s.commit()

        res = await async_authed_client.get("/api/v1/global_rules", params={"search": "zz-nodetail-gr"})
        item = next(i for i in res.json()["items"] if i["name"] == "zz-nodetail-gr")
        assert item["last_publish_detail"] is None


class TestImportDropsRuntimeState:
    """D12：_entity_kwargs 统一丢弃运行态发布状态（含既有 last_publish_status 泄漏修复）。"""

    def test_drops_runtime_keys_for_non_static_models(self):
        kwargs = _entity_kwargs(
            {
                "name": "imported-route",
                "uri": "/x/*",
                "last_publish_status": "partial",
                "last_publish_detail": _detail_json(),
                "last_published_at": "2026-11-01T00:00:00",
                "last_publish_ok": True,
            },
            1,
        )
        assert "last_publish_status" not in kwargs
        assert "last_publish_detail" not in kwargs
        assert "last_published_at" not in kwargs
        assert "last_publish_ok" not in kwargs
        assert kwargs["name"] == "imported-route"
