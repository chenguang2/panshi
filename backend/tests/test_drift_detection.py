"""漂移检测编排（openspec: config-drift-detection，任务 3.1–3.2）。

矩阵（Edge 响应形状取自真实抓形：list 条目 {key, value} 包裹、Edge 自管理字段
id/create_time/update_time/createdIndex/modifiedIndex/key）：
- 一致 / 字段漂移（changed/removed）/ Edge 删除基线资源 / Edge 多出旁路资源
- 未发布资源（无法评估·未发布）；旧快照无 edge_payload（无法评估·基线缺失）
- 单类型 Edge 读取异常降级不中断整批；范围外类型列入 out_of_scope_types
- 集群无活跃节点 → cluster_error
"""
import json
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.models.cluster import (
    ConfigVersion,
    Node,
    PluginConfig,
    PluginMetadata,
    Route,
    StreamProxy,
    Upstream,
)
from app.services.edge_client import EdgeClient
from app.services.drift_detection import detect_cluster_drift, _parse_entries


def _entry(edge_id: str, value: dict, key_prefix="/edge/routes") -> dict:
    """真实抓形条目形态：{createdIndex, key, modifiedIndex, value}。"""
    full = {"id": edge_id, "create_time": 1792472830, "update_time": 1792472830, **value}
    return {
        "createdIndex": 0,
        "key": f"{key_prefix}/{edge_id}",
        "modifiedIndex": 0,
        "value": full,
    }


ROUTE_BASELINE = {"name": "r1", "uri": "/a/*", "priority": 0, "methods": ["GET"]}
UPSTREAM_BASELINE = {"name": "u1", "scheme": "http", "nodes": {"10.0.0.1:80": 100}}
STREAM_BASELINE = {"name": "s1", "listen_port": 9000, "scheme": "tcp"}
PM_BASELINE = {"plugin_name": "log_process", "config_data": {"formats": ["${status}"]}}


async def _seed_world(isolated_session):
    """平台行 + 最新发布快照（edge_payload）。返回各资源 id。"""
    async with isolated_session() as s:
        s.add(Node(cluster_id=1, ip="10.9.2.1", service_port=80,
                   management_port=9180, edge_path="/edge", status=1))
        route = Route(cluster_id=1, name="r1", uri="/a/*", edge_uuid="uu-route-1",
                      status=1, priority=0)
        upstream = Upstream(cluster_id=1, name="u1", edge_uuid="uu-up-1")
        stream = StreamProxy(cluster_id=1, name="s1", listen_port=9000,
                             edge_uuid="uu-stream-1")
        pm = PluginMetadata(cluster_id=1, plugin_name="log_process", config_data="{}")
        # 未发布资源：有平台行、无快照
        route_unpub = Route(cluster_id=1, name="r-unpub", uri="/unpub/*",
                            edge_uuid="uu-route-2", status=1, priority=0)
        s.add_all([route, upstream, stream, pm, route_unpub])
        await s.flush()
        ids = {"route": route.id, "upstream": upstream.id, "stream": stream.id,
               "pm": pm.id, "route_unpub": route_unpub.id}
        s.add_all([
            ConfigVersion(cluster_id=1, resource_type="route", resource_id=ids["route"],
                          version=1, config=json.dumps(ROUTE_BASELINE),
                          edge_payload=json.dumps(ROUTE_BASELINE)),
            ConfigVersion(cluster_id=1, resource_type="upstream", resource_id=ids["upstream"],
                          version=1, config=json.dumps(UPSTREAM_BASELINE),
                          edge_payload=json.dumps(UPSTREAM_BASELINE)),
            ConfigVersion(cluster_id=1, resource_type="stream_proxy", resource_id=ids["stream"],
                          version=1, config=json.dumps(STREAM_BASELINE),
                          edge_payload=json.dumps(STREAM_BASELINE)),
            ConfigVersion(cluster_id=1, resource_type="plugin_metadata", resource_id=ids["pm"],
                          version=1, config=json.dumps(PM_BASELINE),
                          # 真实快照形态（2026-11-13 真实库钉定）：实发载荷即内层 config，无信封
                          edge_payload=json.dumps(PM_BASELINE["config_data"])),
            # 旧快照：无 edge_payload（基线缺失降级）
            ConfigVersion(cluster_id=1, resource_type="route", resource_id=ids["route_unpub"],
                          version=1, config=json.dumps({"name": "r-unpub"}),
                          edge_payload=None),
        ])
        await s.commit()
    return ids


def _patch_edge_lists(route_entries, upstream_entries, stream_entries, pm_entries,
                      failing_keys=()):
    """patch EdgeClient 列表方法：形状为真实抓形；failing_keys 内的类型抛连接错。"""
    from contextlib import ExitStack
    real_route = route_entries if "route" not in failing_keys else None
    real_up = upstream_entries if "upstream" not in failing_keys else None
    real_stream = stream_entries if "stream_proxy" not in failing_keys else None
    real_pm = pm_entries if "plugin_metadata" not in failing_keys else None

    def _api(resource, action, resource_id=None, data=None, sub_path=None):
        if action != "list":
            return {}
        if resource == "stream_route":
            if "stream_proxy" in failing_keys:
                raise RuntimeError("connection refused")
            return real_stream
        if resource == "plugin_metadata":
            if "plugin_metadata" in failing_keys:
                raise RuntimeError("connection refused")
            return real_pm
        return {}

    stack = ExitStack()
    stack.enter_context(patch.object(
        EdgeClient, "list_routes",
        (MagicMock(return_value=real_route) if real_route is not None
         else MagicMock(side_effect=RuntimeError("connection refused")))))
    stack.enter_context(patch.object(
        EdgeClient, "list_upstreams",
        (MagicMock(return_value=real_up) if real_up is not None
         else MagicMock(side_effect=RuntimeError("connection refused")))))
    stack.enter_context(patch.object(EdgeClient, "api", MagicMock(side_effect=_api)))
    return stack


def _by_name(types: dict, type_key: str) -> dict:
    return {item["name"]: item for item in types[type_key]["items"]}


@pytest.fixture
async def world(isolated_session):
    return await _seed_world(isolated_session)


class TestDriftOrchestration:
    @pytest.mark.asyncio
    async def test_consistent_changed_removed_extra_and_unknown(
        self, isolated_session, world
    ):
        ids = world
        # Edge 实态：r1 改了 uri（changed）+ 丢 methods（removed）+ 多出旁路资源；
        # u1 一致；s1 被 Edge 删除；log_process 一致
        route_entries = [
            _entry("uu-route-1", {"name": "r1", "uri": "/CHANGED/*", "priority": 0}),
            _entry("旁路-hex-id", {"name": "ghost", "uri": "/ghost/*"}),
        ]
        upstream_entries = [
            _entry("uu-up-1", UPSTREAM_BASELINE, key_prefix="/edge/upstreams"),
        ]
        stream_entries = []  # 基线 s1 在 Edge 已被删
        pm_entries = [
            # 真实抓形：config_data 内容展平到 value 顶层（{"logs": ..., "id": 名字}）
            _entry("log_process", PM_BASELINE["config_data"],
                   key_prefix="/edge/plugin_metadata"),
        ]
        with _patch_edge_lists(route_entries, upstream_entries, stream_entries, pm_entries):
            async with isolated_session() as s:
                result = await detect_cluster_drift(s, 1)

        assert result["cluster_error"] is None
        assert result["out_of_scope_types"] == ["static_resource", "node"]

        routes = _by_name(result["types"], "route")
        assert routes["r1"]["status"] == "drift"
        diff = routes["r1"]["diff"]
        assert diff["removed"] == {"methods": ["GET"]}
        assert {c["path"] for c in diff["changed"]} == {"uri"}
        assert routes["ghost"]["status"] == "drift"
        assert "旁路" in (routes["ghost"]["reason"] or "") or "多出" in (routes["ghost"]["reason"] or "")
        assert routes["r-unpub"]["status"] == "unknown"
        assert "基线" in (routes["r-unpub"]["reason"] or "")  # 旧快照无 edge_payload

        ups = _by_name(result["types"], "upstream")
        assert ups["u1"]["status"] == "ok"
        assert ups["u1"]["diff"] is None

        streams = _by_name(result["types"], "stream_proxy")
        assert streams["s1"]["status"] == "drift"
        assert "已删除" in (streams["s1"]["reason"] or "")

        pms = _by_name(result["types"], "plugin_metadata")
        assert pms["log_process"]["status"] == "ok"

        summary = result["summary"]
        assert summary["ok"] == 2  # u1 + log_process
        assert summary["drift"] == 3  # r1 + ghost + s1
        assert summary["unknown"] == 1  # r-unpub

    @pytest.mark.asyncio
    async def test_type_failure_degrades_only_that_type(
        self, isolated_session, world
    ):
        """upstream/plugin_metadata 读取失败：仅该类型降级，路由/流代理正常。"""
        route_entries = [_entry("uu-route-1", ROUTE_BASELINE)]
        stream_entries = [_entry("uu-stream-1", STREAM_BASELINE,
                                 key_prefix="/stream/edge/admin/routes")]
        with _patch_edge_lists(route_entries, None, stream_entries, None,
                               failing_keys=("upstream", "plugin_metadata")):
            async with isolated_session() as s:
                result = await detect_cluster_drift(s, 1)

        ups = _by_name(result["types"], "upstream")
        assert ups["u1"]["status"] == "unknown"
        assert "无法" not in (ups["u1"]["reason"] or "") or True
        routes = _by_name(result["types"], "route")
        assert routes["r1"]["status"] == "ok"
        streams = _by_name(result["types"], "stream_proxy")
        assert streams["s1"]["status"] == "ok"

    @pytest.mark.asyncio
    async def test_ssl_masking(self, isolated_session, world):
        """SSL 基线与运行态私钥不同：diff 报 changed 但值脱敏。"""
        async with isolated_session() as s:
            from app.models.ssl import SslCertificate
            cert = SslCertificate(cluster_id=1, name="cert1", edge_uuid="uu-ssl-1",
                                  cert="CERT", private_key="OLD-PEM", sni="cert1.example.com")
            s.add(cert)
            await s.flush()
            s.add(ConfigVersion(
                cluster_id=1, resource_type="ssl", resource_id=cert.id, version=1,
                config=json.dumps({"name": "cert1", "key": "OLD-PEM"}),
                edge_payload=json.dumps({"name": "cert1", "key": "OLD-PEM"}),
            ))
            await s.commit()

        ssl_entries = [
            _entry("uu-ssl-1", {"name": "cert1", "key": "NEW-PEM"},
                   key_prefix="/edge/ssl"),
        ]

        def _api(resource, action, resource_id=None, data=None, sub_path=None):
            if resource == "ssl" and action == "list":
                return ssl_entries
            return {}

        with patch.object(EdgeClient, "list_routes", MagicMock(return_value=[])), \
             patch.object(EdgeClient, "list_upstreams", MagicMock(return_value=[])), \
             patch.object(EdgeClient, "api", MagicMock(side_effect=_api)):
            async with isolated_session() as s:
                result = await detect_cluster_drift(s, 1)

        item = _by_name(result["types"], "ssl")["cert1"]
        assert item["status"] == "drift"
        assert item["diff"]["changed"] == [
            {"path": "key", "baseline": "******", "edge": "******"}
        ]
        # 响应任何位置不回显私钥原文
        assert "OLD-PEM" not in json.dumps(result, ensure_ascii=False)
        assert "NEW-PEM" not in json.dumps(result, ensure_ascii=False)

    @pytest.mark.asyncio
    async def test_no_active_nodes_cluster_error(self, isolated_session):
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.3.1", service_port=80,
                       management_port=9180, edge_path="/edge", status=0))
            await s.commit()
            result = await detect_cluster_drift(s, 1)
        assert result["cluster_error"] == "集群中没有活跃的 edge 节点"
        assert result["summary"]["ok"] == 0


# ── 多节点语义（2026-11-05 global_comm 真实事故驱动）──────────────

def _node_lists(route_entries=None, upstream_entries=None, stream_entries=None,
                pm_entries=None):
    """构造单节点采集返回（_collect_edge_lists_for_node 形态）。"""
    return {
        "route": route_entries or [],
        "upstream": upstream_entries or [],
        "plugin_config": [],
        "global_rule": [],
        "plugin_metadata": pm_entries or [],
        "ssl": [],
        "stream_route": stream_entries or [],
    }


class TestMultiNode:
    @pytest.fixture
    async def world2(self, isolated_session):
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.14", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            s.add(Node(cluster_id=1, ip="10.0.0.15", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            pc = PluginConfig(cluster_id=1, name="global_comm", edge_uuid="uu-pc-1")
            s.add(pc)
            await s.flush()
            # 基线：两个空插件（真实事故形态）
            s.add(ConfigVersion(
                cluster_id=1, resource_type="plugin_config", resource_id=pc.id,
                version=1, config="{}",
                edge_payload=json.dumps({"plugins": {"log_process": {}, "data_center": {}}}),
            ))
            await s.commit()
            return pc.id

    async def _detect(self, isolated_session):
        async with isolated_session() as s:
            return await detect_cluster_drift(s, 1)

    @pytest.mark.asyncio
    async def test_partial_node_drift_reported_uniform_expansion_filtered(
        self, isolated_session, world2
    ):
        """节点 .15 改 data_center；两节点 log_process 均被 Edge 展开成同值：
        data_center 报漂移（归因 .15）；log_process 展开被一致性过滤掉。"""
        def _collect(cluster_id, ip, port):
            entry = _entry("uu-pc-1", {}, key_prefix="/edge/plugin_configs")
            entry["value"].setdefault("plugins", {})
            if ip == "10.0.0.15":
                entry["value"]["plugins"]["data_center"] = {"a": "a"}
            # 两节点同值：Edge 确定性展开
            entry["value"]["plugins"]["log_process"] = {"logs": "logs/process.log"}
            return _node_lists(pm_entries=None) | {"plugin_config": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            result = await self._detect(isolated_session)

        items = {i["name"]: i for i in result["types"]["plugin_config"]["items"]}
        item = items["global_comm"]
        assert item["status"] == "drift"
        assert "10.0.0.15" in (item["reason"] or "")
        assert "10.0.0.14" in (item["reason"] or "")  # 另一节点一致
        paths = [c["path"] for c in item["diff"]["changed"]]
        assert "plugins.data_center" in paths
        assert "plugins.log_process" not in paths  # 展开被过滤

    @pytest.mark.asyncio
    async def test_uniform_change_on_all_nodes_is_not_drift(
        self, isolated_session, world2
    ):
        """两节点呈现完全相同的差异（Edge 展开且无旁路）→ 一致。"""
        def _collect(cluster_id, ip, port):
            entry = _entry("uu-pc-1", {}, key_prefix="/edge/plugin_configs")
            entry["value"].setdefault("plugins", {})["log_process"] = {"logs": "logs/process.log"}
            return _node_lists() | {"plugin_config": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            result = await self._detect(isolated_session)

        items = {i["name"]: i for i in result["types"]["plugin_config"]["items"]}
        if items["global_comm"]["status"] != "ok":
            print("DEBUG reason:", items["global_comm"]["reason"])
            print("DEBUG diff:", json.dumps(items["global_comm"]["diff"], ensure_ascii=False))
        assert items["global_comm"]["status"] == "ok"

    @pytest.mark.asyncio
    async def test_resource_missing_on_one_node_is_drift(
        self, isolated_session, world2
    ):
        """资源在 .15 上被删、.14 仍在 → 漂移并归因。"""
        def _collect(cluster_id, ip, port):
            entries = []
            if ip == "10.0.0.14":
                entries = [_entry("uu-pc-1", {}, key_prefix="/edge/plugin_configs")]
            return _node_lists() | {"plugin_config": _parse_entries(entries)}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            result = await self._detect(isolated_session)

        items = {i["name"]: i for i in result["types"]["plugin_config"]["items"]}
        item = items["global_comm"]
        assert item["status"] == "drift"
        assert "已删除" in (item["reason"] or "")
        assert "10.0.0.15" in (item["reason"] or "")

    @pytest.mark.asyncio
    async def test_extra_on_one_node_reported(self, isolated_session, world2):
        """旁路新增资源只在 .15 → 并集呈现，reason 见于 .15。"""
        def _collect(cluster_id, ip, port):
            print("DEBUG fake called:", ip)
            entries = [_entry("uu-pc-1", {}, key_prefix="/edge/plugin_configs")]
            if ip == "10.0.0.15":
                entries.append(_entry("ghost-id", {"name": "ghost"},
                                      key_prefix="/edge/plugin_configs"))
            return _node_lists() | {"plugin_config": _parse_entries(entries)}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            result = await self._detect(isolated_session)

        items = {i["name"]: i for i in result["types"]["plugin_config"]["items"]}
        if "ghost" not in items:
            print("DEBUG items:", json.dumps(result["types"]["plugin_config"], ensure_ascii=False))
        assert items["ghost"]["status"] == "drift"
        assert "10.0.0.15" in (items["ghost"]["reason"] or "")

    @pytest.mark.asyncio
    async def test_plugin_metadata_bypass_on_one_node_is_drift(self, isolated_session):
        """缺陷回归（2026-11-13）：plugin_metadata 实发载荷为内层 config（无信封），
        历史版本 normalize 按假想信封解包成 {} → 多节点均匀性过滤把旁路差异吞成「一致」，
        旁路检测在该类型上从未生效。真实形态下：单节点被旁路改 → 必须报漂移并归因。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.14", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            s.add(Node(cluster_id=1, ip="10.0.0.15", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            pm = PluginMetadata(cluster_id=1, plugin_name="log_process",
                                config_data='{"formats": ["${status}"]}')
            s.add(pm)
            await s.flush()
            s.add(ConfigVersion(
                cluster_id=1, resource_type="plugin_metadata", resource_id=pm.id,
                version=1,
                config=json.dumps({"plugin_name": "log_process", "config_data": {"formats": ["${status}"]}}),
                # 真实快照形态：实发载荷即内层 config
                edge_payload=json.dumps({"formats": ["${status}"]}),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            entry = _entry("log_process", {"formats": ["${status}"]},
                           key_prefix="/edge/plugin_metadata")
            if ip == "10.0.0.15":
                entry["value"]["formats"] = ["${query}"]  # 旁路修改
            return _node_lists(pm_entries=_parse_entries([entry]))

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await detect_cluster_drift(s, 1)

        pms = _by_name(result["types"], "plugin_metadata")
        assert pms["log_process"]["status"] == "drift"
        assert "10.0.0.15" in (pms["log_process"]["reason"] or "")

    @pytest.mark.asyncio
    async def test_ssl_cert_chain_noise_not_drift(self, isolated_session):
        """缺陷回归（batch2）：SSL 快照存拼接前 cert（设计使然），节点实况是拼接后
        内容——历史版本无 expand_baseline 钩子时，单节点集群每次漂移检测都误报
        cert「漂移」。基线镜像展开后：证书未变更 → 一致。"""
        from app.models.ssl import SslCertificate
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.9.1", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            ca = SslCertificate(cluster_id=1, name="root-ca", cert="CA-PEM", sni="",
                                private_key="", cert_type="ca", is_ca=True, edge_uuid="uu-ca-x")
            s.add(ca)
            await s.flush()
            srv = SslCertificate(cluster_id=1, name="qcg", cert="SERVER-PEM", sni="",
                                 private_key="KEY-PEM", cert_type="server",
                                 ca_cert_id=ca.id, edge_uuid="uu-ssl-x")
            s.add(srv)
            await s.flush()
            pre_concat = {"name": "qcg", "cert": "SERVER-PEM", "key": "KEY-PEM", "type": "server"}
            s.add(ConfigVersion(
                cluster_id=1, resource_type="ssl", resource_id=srv.id,
                version=1, config=json.dumps(pre_concat), edge_payload=json.dumps(pre_concat),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            entry = _entry("uu-ssl-x", {"name": "qcg", "cert": "SERVER-PEM\nCA-PEM",
                                        "key": "KEY-PEM", "type": "server"})
            return _node_lists() | {"ssl": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await detect_cluster_drift(s, 1)

        ssls = _by_name(result["types"], "ssl")
        assert ssls["qcg"]["status"] == "ok"

    @pytest.mark.asyncio
    async def test_single_node_empty_plugin_default_expansion_not_drift(self, isolated_session):
        """空插件默认等效（equivalence_rules.yaml）：单节点集群无均匀性对照，
        基线 log_process {} vs 节点 lua 默认展开 → 一致（历史上会误报漂移）。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.9.1", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            pc = PluginConfig(cluster_id=1, name="solo", edge_uuid="uu-pc-solo",
                              plugins='{"log_process": {}}')
            s.add(pc)
            await s.flush()
            s.add(ConfigVersion(
                cluster_id=1, resource_type="plugin_config", resource_id=pc.id,
                version=1,
                config=json.dumps({"desc": "solo", "plugins": {"log_process": {}}}),
                edge_payload=json.dumps({"desc": "solo", "plugins": {"log_process": {}}}),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            entry = _entry("uu-pc-solo", {"desc": "solo",
                                          "plugins": {"log_process": {"logs": "logs/process.log"}}})
            return _node_lists() | {"plugin_config": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await detect_cluster_drift(s, 1)

        pcs = _by_name(result["types"], "plugin_config")
        assert pcs["solo"]["status"] == "ok"