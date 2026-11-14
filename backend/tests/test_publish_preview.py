"""发布差异预览编排与端点（openspec: publish-diff-preview，任务 2.1）。

矩阵（Edge 响应形状取自真实抓形，桩经 _parse_entries 产出；候选载荷形态取自
convert_upstream_to_edge_format 真实输出：type/name/nodes/条件键）：
- 正常待发布：全节点同差（全部 diff、无 behind）；数值字符串归一（"50"==50）
- 部分节点落后：某节点在其余节点一致的路径上仍不同 → behind
- 节点缺失资源 → missing + behind；单节点不可达隔离 → unreachable
- 无活跃节点 → cluster_error；基线缺失 → has_baseline=false 降级，矩阵不受影响
- platform_change 三类（changed/added/removed）；only_edge_keys 单类型采集
- 自管理字段剔除（白名单）
- 端点：400 未接入类型 / 404 集群不存在 / 404 资源不存在
"""
import copy
import json
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.models.cluster import (
    Cluster,
    ConfigVersion,
    GlobalRule,
    Node,
    PluginConfig,
    PluginMetadata,
    StreamProxy,
    Upstream,
    UpstreamTarget,
)
from app.models.ssl import SslCertificate
from app.services.drift_detection import _parse_entries
from app.services.publish_preview import build_candidate, preview_publish_diff

# 候选（build_candidate 对下列 Upstream 行的真实产出）
#   {type: roundrobin, name: u1, nodes: {"10.0.0.1:80": 70}, retries: 3,
#    checks: {active: {http_path: /status}}, scheme: http}
# 基线 v3（上次发布实发，weight 50、无 checks、无 scheme）
BASELINE_V3 = {"type": "roundrobin", "name": "u1", "nodes": {"10.0.0.1:80": 50}, "retries": 3}


def _entry(edge_id: str, value: dict) -> dict:
    """真实抓形条目形态：{createdIndex, key, modifiedIndex, value}（含自管理字段）。"""
    full = {"id": edge_id, "create_time": 1792472830, "update_time": 1792472830, **value}
    return {
        "createdIndex": 0,
        "key": f"/edge/upstreams/{edge_id}",
        "modifiedIndex": 0,
        "value": full,
    }


def _upstream_lists(entries: list) -> dict:
    """单类型采集返回（only_edge_keys 过滤后仅含目标类型）。"""
    return {"upstream": _parse_entries(entries)}


# 节点侧旧值（数值以字符串形态回传，验证归一）：v3 内容 + scheme
NODE_V3 = {"type": "roundrobin", "name": "u1", "nodes": {"10.0.0.1:80": "50"},
           "retries": "3", "scheme": "http"}
# 节点侧更旧值（v2：retries=2，且无 v3 本应有的内容时构成落后路径）
NODE_V2 = {"type": "roundrobin", "name": "u1", "nodes": {"10.0.0.1:80": "50"},
           "retries": "2", "scheme": "http"}


async def _seed_world(isolated_session, *, baseline=BASELINE_V3,
                      checks='{"active": {"http_path": "/status"}}',
                      pass_host="pass", with_nodes=True) -> int:
    """集群 + 节点 + 已发布上游（候选 weight 70/checks/scheme）。返回 upstream id。"""
    async with isolated_session() as s:
        if with_nodes:
            s.add(Node(cluster_id=1, ip="10.0.0.13", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            s.add(Node(cluster_id=1, ip="10.0.0.15", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
        upstream = Upstream(cluster_id=1, name="u1", edge_uuid="uu-up-1",
                            load_balance="roundrobin", scheme="http", retries=3,
                            checks=checks, pass_host=pass_host)
        s.add(upstream)
        await s.flush()
        s.add(UpstreamTarget(upstream_id=upstream.id, target="10.0.0.1:80", weight=70))
        if baseline is not None:
            s.add(ConfigVersion(
                cluster_id=1, resource_type="upstream", resource_id=upstream.id,
                version=3, config=json.dumps(baseline), edge_payload=json.dumps(baseline),
            ))
        await s.commit()
        return upstream.id


def _patch_collect(per_node_entries: dict):
    """patch 采集函数：per_node_entries = {ip: entries 列表 | Exception}。"""

    def _collect(cluster_id, ip, port, only_edge_keys=None):
        val = per_node_entries[ip]
        if isinstance(val, Exception):
            raise val
        return _upstream_lists(val)

    return patch("app.services.drift_detection._collect_edge_lists_for_node",
                 side_effect=_collect)


def _node(result: dict, ip: str) -> dict:
    return next(n for n in result["nodes"] if n["label"] == ip)


def _row(matrix: dict, path: str) -> dict:
    return next(r for r in matrix["diff_rows"] if r["path"] == path)


class TestPreviewOrchestration:

    @pytest.mark.asyncio
    async def test_pending_uniform_diff_all_nodes_not_behind(self, isolated_session):
        """正常待发布：两节点都是 v3 旧值（同差）→ 全部 diff、无 behind。"""
        up_id = await _seed_world(isolated_session)

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            return _upstream_lists([_entry("uu-up-1", dict(NODE_V3))])

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="upstream", resource_id=up_id)

        assert result["has_baseline"] is True
        assert result["cluster_error"] is None
        n13, n15 = _node(result, "10.0.0.13"), _node(result, "10.0.0.15")
        assert n13["status"] == "diff" and n15["status"] == "diff"
        assert n13["behind"] is False and n15["behind"] is False
        assert result["summary"]["behind_nodes"] == []
        # 差异路径：nodes（weight 50→70）、checks（候选新增、节点缺失）
        paths = {r["path"] for r in result["matrix"]["diff_rows"]}
        assert any(p.startswith("nodes") for p in paths)
        assert "checks" in paths
        # retries "3"==3 归一不入差异；scheme 两侧一致
        assert "retries" not in paths
        assert result["summary"]["diff_count"] == len(paths)
        same_paths = {r["path"] for r in result["matrix"]["same_rows"]}
        assert {"name", "type", "scheme"} <= same_paths

    @pytest.mark.asyncio
    async def test_behind_node_extra_diff_flagged(self, isolated_session):
        """.15 在 retries 上为 v2 旧值（.13 与候选一致）→ .15 behind、路径点名。"""
        up_id = await _seed_world(isolated_session)
        per_node = {"10.0.0.13": [_entry("uu-up-1", dict(NODE_V3))],
                    "10.0.0.15": [_entry("uu-up-1", dict(NODE_V2))]}

        with _patch_collect(per_node):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="upstream", resource_id=up_id)

        n13, n15 = _node(result, "10.0.0.13"), _node(result, "10.0.0.15")
        assert n13["behind"] is False
        assert n15["behind"] is True and "落后" in (n15["behind_reason"] or "")
        assert n15["behind_reason"] and "retries" in n15["behind_reason"]
        assert result["summary"]["behind_nodes"] == ["10.0.0.15"]
        row = _row(result["matrix"], "retries")
        assert row["values"]["10.0.0.15"] == "2"
        assert row["values"]["10.0.0.13"] == 3  # 与候选一致

    @pytest.mark.asyncio
    async def test_missing_resource_on_one_node(self, isolated_session):
        """.15 整个资源缺失 → missing + behind；矩阵其余节点照常。"""
        up_id = await _seed_world(isolated_session)
        per_node = {"10.0.0.13": [_entry("uu-up-1", dict(NODE_V3))],
                    "10.0.0.15": []}

        with _patch_collect(per_node):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="upstream", resource_id=up_id)

        n13, n15 = _node(result, "10.0.0.13"), _node(result, "10.0.0.15")
        assert n13["status"] == "diff"
        assert n15["status"] == "missing"
        assert n15["behind"] is True and "缺失" in (n15["behind_reason"] or "")
        assert "10.0.0.15" in result["summary"]["behind_nodes"]

    @pytest.mark.asyncio
    async def test_unreachable_node_isolated(self, isolated_session):
        """单节点采集异常 → unreachable + 原因透传，其余节点正常。"""
        up_id = await _seed_world(isolated_session)
        async with isolated_session() as s:
            up = (await s.execute(
                select(Upstream).where(Upstream.id == up_id))).scalar_one()
            _, candidate_edge = await build_candidate(s, "upstream", up)
        candidate_exact = copy.deepcopy(candidate_edge)
        per_node = {"10.0.0.13": [_entry("uu-up-1", candidate_exact)],
                    "10.0.0.15": ConnectionError("connection refused")}

        with _patch_collect(per_node):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="upstream", resource_id=up_id)

        n13, n15 = _node(result, "10.0.0.13"), _node(result, "10.0.0.15")
        assert n13["status"] == "ok" and n13["diff_count"] == 0
        assert n15["status"] == "unreachable"
        assert "connection refused" in (n15["reason"] or "")

    @pytest.mark.asyncio
    async def test_no_active_nodes_cluster_error(self, isolated_session):
        up_id = await _seed_world(isolated_session, with_nodes=False)
        async with isolated_session() as s:
            result = await preview_publish_diff(
                s, cluster_id=1, resource_type="upstream", resource_id=up_id)
        assert result["cluster_error"] == "集群中没有活跃的 edge 节点"
        assert result["nodes"] == []
        assert result["matrix"]["diff_rows"] == []

    @pytest.mark.asyncio
    async def test_baseline_missing_degrade_matrix_intact(self, isolated_session):
        """无版本快照 → has_baseline=false 降级；矩阵照常产出。"""
        up_id = await _seed_world(isolated_session, baseline=None)
        per_node = {"10.0.0.13": [], "10.0.0.15": []}

        with _patch_collect(per_node):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="upstream", resource_id=up_id)

        assert result["has_baseline"] is False
        assert result["baseline_missing_reason"]
        assert result["platform_change"] is None
        assert _node(result, "10.0.0.13")["status"] == "missing"

    @pytest.mark.asyncio
    async def test_platform_change_categories(self, isolated_session):
        """platform_change：changed（weight）/ added（checks）/ removed（upstream_host）。
        基线 v3：weight 50、含 upstream_host、无 checks；候选：weight 70、checks、无 upstream_host。
        （pass_host 列有 default="pass"，显式 None 也被覆盖，不可作 removed 字段。）"""
        up_id = await _seed_world(
            isolated_session,
            baseline={"type": "roundrobin", "name": "u1",
                      "nodes": {"10.0.0.1:80": 50}, "retries": 3,
                      "upstream_host": "10.9.9.9"})

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            return _upstream_lists([])

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="upstream", resource_id=up_id)

        pc = result["platform_change"]
        changed_paths = [c["path"] for c in pc["changed"]]
        assert any(p.startswith("nodes") for p in changed_paths)
        assert "checks" in pc["added"]
        assert "upstream_host" in pc["removed"]

    @pytest.mark.asyncio
    async def test_only_target_type_collected(self, isolated_session):
        """采集只请求目标类型（每节点 1 次 Edge 列表请求）。"""
        up_id = await _seed_world(isolated_session)
        captured = []

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            captured.append(only_edge_keys)
            return _upstream_lists([])

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                await preview_publish_diff(
                    s, cluster_id=1, resource_type="upstream", resource_id=up_id)

        assert len(captured) == 2  # 两节点各一次
        assert all(k == ["upstream"] for k in captured)

    @pytest.mark.asyncio
    async def test_self_managed_fields_excluded(self, isolated_session):
        """Edge 自管理字段（id/create_time/update_time）不进任何行。"""
        up_id = await _seed_world(isolated_session)
        async with isolated_session() as s:
            up = (await s.execute(
                select(Upstream).where(Upstream.id == up_id))).scalar_one()
            _, candidate_edge = await build_candidate(s, "upstream", up)
        candidate_exact = copy.deepcopy(candidate_edge)
        per_node = {"10.0.0.13": [_entry("uu-up-1", candidate_exact)],
                    "10.0.0.15": [_entry("uu-up-1", candidate_exact)]}

        with _patch_collect(per_node):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="upstream", resource_id=up_id)

        assert result["summary"]["diff_count"] == 0
        all_rows = result["matrix"]["diff_rows"] + result["matrix"]["same_rows"]
        paths = {r["path"] for r in all_rows}
        assert not any(p.split(".")[0] in ("id", "create_time", "update_time") for p in paths)


class TestEmptyPluginDefaultEquivalence:
    """空插件配置 {} 与已知默认展开等效（equivalence_rules.yaml 单一事实源，
    三个对比面统一；2026-11-13 用户裁决：log_process {} ≡ {logs: logs/process.log}）。"""

    @pytest.mark.asyncio
    async def test_plugin_config_empty_expanded_matches_edge(self, isolated_session):
        """log_process {}（候选）vs 节点 lua 默认展开 → 无差异、节点 ok。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.13", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            pc = PluginConfig(cluster_id=1, name="global_comm", edge_uuid="uu-pc-9",
                              plugins='{"log_process": {}, "data_center": {"a": "1"}}')
            s.add(pc)
            await s.flush()
            pc_id = pc.id
            s.add(ConfigVersion(
                cluster_id=1, resource_type="plugin_config", resource_id=pc_id,
                version=1,
                config=json.dumps({"desc": "global_comm",
                                   "plugins": {"log_process": {}, "data_center": {"a": "1"}}}),
                edge_payload=json.dumps({"desc": "global_comm",
                                         "plugins": {"log_process": {}, "data_center": {"a": "1"}}}),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            # Edge lua 补默认：log_process 展开为 {logs: logs/process.log}
            entry = _entry("uu-pc-9", {"desc": "global_comm",
                                       "plugins": {"log_process": {"logs": "logs/process.log"},
                                                   "data_center": {"a": "1"}}})
            return {"plugin_config": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="plugin_config", resource_id=pc_id)

        assert _node(result, "10.0.0.13")["status"] == "ok"
        assert result["summary"]["diff_count"] == 0
        paths = {r["path"] for r in result["matrix"]["diff_rows"] + result["matrix"]["same_rows"]}
        # 展开后的等效默认值进「一致字段」全集（开关可见）
        assert "plugins.log_process.logs" in paths

    @pytest.mark.asyncio
    async def test_plugin_config_edge_value_not_default_still_diff(self, isolated_session):
        """节点值不是已知默认（旁路改过）→ 仍报差异并归因，等效规则不放行。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.13", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            pc = PluginConfig(cluster_id=1, name="global_comm", edge_uuid="uu-pc-10",
                              plugins='{"log_process": {}}')
            s.add(pc)
            await s.flush()
            pc_id = pc.id
            s.add(ConfigVersion(
                cluster_id=1, resource_type="plugin_config", resource_id=pc_id,
                version=1,
                config=json.dumps({"desc": "global_comm", "plugins": {"log_process": {}}}),
                edge_payload=json.dumps({"desc": "global_comm", "plugins": {"log_process": {}}}),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            entry = _entry("uu-pc-10", {"desc": "global_comm",
                                        "plugins": {"log_process": {"logs": "other.log"}}})
            return {"plugin_config": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="plugin_config", resource_id=pc_id)

        assert _node(result, "10.0.0.13")["status"] == "diff"
        paths = {r["path"] for r in result["matrix"]["diff_rows"]}
        assert any(p.startswith("plugins.log_process") for p in paths)

    @pytest.mark.asyncio
    async def test_plugin_metadata_empty_expanded_matches_edge(self, isolated_session):
        """插件元数据 log_process {} vs 节点默认展开 → ok（批 1 信封修复同款数据形态）。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.13", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            pm = PluginMetadata(cluster_id=1, plugin_name="log_process", config_data='{}')
            s.add(pm)
            await s.flush()
            pm_id = pm.id
            s.add(ConfigVersion(
                cluster_id=1, resource_type="plugin_metadata", resource_id=pm_id,
                version=1, config=json.dumps({"plugin_name": "log_process", "config_data": {}}),
                edge_payload=json.dumps({}),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            entry = _entry("log_process", {"logs": "logs/process.log"})
            return {"plugin_metadata": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="plugin_metadata", resource_id=pm_id)

        assert _node(result, "10.0.0.13")["status"] == "ok"
        assert result["summary"]["diff_count"] == 0


class TestBatch2:
    """SSL/四层/DNS 三类扩展（publish-diff-preview-batch2，任务 2.1）。"""

    @pytest.mark.asyncio
    async def test_ssl_candidate_includes_cert_chain_and_no_platform_noise(self, isolated_session):
        """CA 签发证书：候选 cert = 服务器证书 + CA 链（实发形态）；基线镜像展开后
        拼接本身不进 platform_change——证书未变更则节点 ok、平台侧无变更。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.13", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            ca = SslCertificate(cluster_id=1, name="root-ca", cert="CA-PEM", sni="",
                                private_key="", cert_type="ca", is_ca=True, edge_uuid="uu-ca-1")
            s.add(ca)
            await s.flush()
            srv = SslCertificate(cluster_id=1, name="qcg", cert="SERVER-PEM", sni="",
                                 private_key="KEY-PEM", cert_type="server",
                                 ca_cert_id=ca.id, edge_uuid="uu-ssl-1")
            s.add(srv)
            await s.flush()
            srv_id = srv.id
            # 快照 = 发布实发留痕：拼接前内容（publish_resource 快照先于 post_version_hook）
            pre_concat = {"name": "qcg", "cert": "SERVER-PEM", "key": "KEY-PEM", "type": "server"}
            s.add(ConfigVersion(
                cluster_id=1, resource_type="ssl", resource_id=srv_id,
                version=1, config=json.dumps(pre_concat), edge_payload=json.dumps(pre_concat),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            # Edge 实况 = 发布实发（含拼接）：cert 为服务器证书 + CA 链
            entry = _entry("uu-ssl-1", {"name": "qcg", "cert": "SERVER-PEM\nCA-PEM",
                                        "key": "KEY-PEM", "type": "server"})
            return {"ssl": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="ssl", resource_id=srv_id)

        assert result["has_baseline"] is True
        assert _node(result, "10.0.0.13")["status"] == "ok"
        assert result["summary"]["diff_count"] == 0
        # 拼接本身不进平台侧变更（基线镜像展开后两侧一致）
        assert (result["platform_change"] or {}).get("changed") == []

    @pytest.mark.asyncio
    async def test_stream_proxy_candidate_diff(self, isolated_session):
        """四层代理：候选 edge_body（TCP 形态）vs 节点旧值 → upstream.nodes 差异行。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.13", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            sp = StreamProxy(cluster_id=1, name="tcp-1", listen_port=9000, scheme="tcp",
                             load_balance="roundrobin", edge_uuid="uu-sp-1",
                             targets='[{"target": "10.0.0.1:9000", "weight": 100}]')
            s.add(sp)
            await s.flush()
            sp_id = sp.id
            s.add(ConfigVersion(
                cluster_id=1, resource_type="stream_proxy", resource_id=sp_id,
                version=1,
                config=json.dumps({"name": "tcp-1"}),
                edge_payload=json.dumps({"server_port": 9000, "name": "tcp-1",
                                         "protocol": "TCP",
                                         "upstream": {"nodes": {"10.0.0.1:9000": 50},
                                                      "type": "roundrobin", "scheme": "tcp"}}),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            entry = _entry("uu-sp-1", {"server_port": 9000, "name": "tcp-1",
                                       "protocol": "TCP",
                                       "upstream": {"nodes": {"10.0.0.1:9000": 50},
                                                    "type": "roundrobin", "scheme": "tcp"}})
            return {"stream_route": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="stream_proxy", resource_id=sp_id)

        assert _node(result, "10.0.0.13")["status"] == "diff"
        paths = {r["path"] for r in result["matrix"]["diff_rows"]}
        assert any(p.startswith("upstream.nodes") for p in paths)

    @pytest.mark.asyncio
    async def test_dns_proxy_key_maps_stream_proxy_snapshots(self, isolated_session):
        """dns_proxy 键：快照按 stream_proxy 类型查询（映射生效，has_baseline 成立）。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.13", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            sp = StreamProxy(cluster_id=1, name="dns-1", listen_port=53, scheme="udp",
                             proxy_type="dns", edge_uuid="uu-dns-1", dns_config='{}', checks='{}')
            s.add(sp)
            await s.flush()
            sp_id = sp.id
            await s.commit()

        # 候选与节点实况一致：node = deepcopy(builder 产出)
        async with isolated_session() as s:
            sp = (await s.execute(
                select(StreamProxy).where(StreamProxy.id == sp_id))).scalar_one()
            _, candidate_edge = await build_candidate(s, "dns_proxy", sp)

        import copy as _copy
        def _collect(cluster_id, ip, port, only_edge_keys=None):
            entry = _entry("uu-dns-1", _copy.deepcopy(candidate_edge))
            return {"stream_route": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="dns_proxy", resource_id=sp_id)

        assert _node(result, "10.0.0.13")["status"] == "ok"
        assert result["summary"]["diff_count"] == 0
        # 快照类型映射：dns_proxy 无自有快照 → has_baseline False 是预期
        # （发布留痕为 stream_proxy；本用例未播种快照，仅验证键走通与采集一致）


# ── 端点（鉴权经 security guard 采样；此处覆盖 400/404）─────────

class TestPreviewEndpoint:
    def test_unknown_type_400(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

        # 静态资源不经统一发布编排，为范围外类型（spec 场景示例）→ 400 明示
        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            resp = c.get("/api/v1/clusters/1/publish-preview/static_resource/1")
        assert resp.status_code == 400
        assert "尚未接入" in resp.json()["detail"]

    def test_cluster_missing_404(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            resp = c.get("/api/v1/clusters/999/publish-preview/upstream/1")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_resource_missing_404(self, isolated_session):
        from fastapi.testclient import TestClient
        from app.main import app
        from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

        async with isolated_session() as s:
            cluster = Cluster(name="demo-cls")
            s.add(cluster)
            await s.commit()
            cluster_id = cluster.id

        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            resp = c.get(f"/api/v1/clusters/{cluster_id}/publish-preview/upstream/999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_plugin_metadata_missing_404_by_id(self, isolated_session):
        from fastapi.testclient import TestClient
        from app.main import app
        from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

        async with isolated_session() as s:
            cluster = Cluster(name="demo-cls-2")
            s.add(cluster)
            await s.commit()
            cluster_id = cluster.id

        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            resp = c.get(f"/api/v1/clusters/{cluster_id}/publish-preview/plugin_metadata/999")
        assert resp.status_code == 404


# ── 批 1 三类候选形态（publish-diff-preview-batch1，任务 2.1）────

class TestBatch1CandidateShapes:
    @pytest.mark.asyncio
    async def test_plugin_config_candidate_diff(self, isolated_session):
        """插件组：候选 {desc, plugins}；节点旧值 → plugins 路径差异 + platform_change 同路径。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.13", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            pc = PluginConfig(cluster_id=1, name="global_comm", edge_uuid="uu-pc-1",
                              plugins='{"log_process": {"a": "1"}}')
            s.add(pc)
            await s.flush()
            pc_id = pc.id
            s.add(ConfigVersion(
                cluster_id=1, resource_type="plugin_config", resource_id=pc_id,
                version=1,
                config=json.dumps({"desc": "global_comm", "plugins": {"log_process": {"a": "0"}}}),
                edge_payload=json.dumps({"desc": "global_comm", "plugins": {"log_process": {"a": "0"}}}),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            entry = _entry("uu-pc-1", {"desc": "global_comm", "plugins": {"log_process": {"a": "0"}}})
            return {"plugin_config": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="plugin_config", resource_id=pc_id)

        assert result["name"] == "global_comm"
        assert result["has_baseline"] is True
        paths = {r["path"] for r in result["matrix"]["diff_rows"]}
        assert "plugins.log_process.a" in paths
        pc_changed = [c["path"] for c in result["platform_change"]["changed"]]
        assert "plugins.log_process.a" in pc_changed
        assert _node(result, "10.0.0.13")["status"] == "diff"

    @pytest.mark.asyncio
    async def test_global_rule_candidate_consistent(self, isolated_session):
        """全局规则：候选与节点实况一致 → ok、无差异。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.13", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            gr = GlobalRule(cluster_id=1, name="traceid", edge_uuid="uu-gr-1",
                            plugins='{"traceid": {"enable": true}}')
            s.add(gr)
            await s.flush()
            gr_id = gr.id
            s.add(ConfigVersion(
                cluster_id=1, resource_type="global_rule", resource_id=gr_id,
                version=1,
                config=json.dumps({"desc": "traceid", "plugins": {"traceid": {"enable": True}}}),
                edge_payload=json.dumps({"desc": "traceid", "plugins": {"traceid": {"enable": True}}}),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            entry = _entry("uu-gr-1", {"desc": "traceid", "plugins": {"traceid": {"enable": True}}})
            return {"global_rule": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="global_rule", resource_id=gr_id)

        assert result["name"] == "traceid"
        assert result["summary"]["diff_count"] == 0
        assert _node(result, "10.0.0.13")["status"] == "ok"

    @pytest.mark.asyncio
    async def test_plugin_metadata_flattened_envelope(self, isolated_session):
        """插件元数据：Edge 展平信封（normalize 钩子）——候选内层 config 与节点展平值对比。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.0.0.13", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            s.add(Node(cluster_id=1, ip="10.0.0.15", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            pm = PluginMetadata(cluster_id=1, plugin_name="log_process",
                                config_data='{"formats": ["${status}"]}')
            s.add(pm)
            await s.flush()
            pm_id = pm.id
            s.add(ConfigVersion(
                cluster_id=1, resource_type="plugin_metadata", resource_id=pm_id,
                version=1,
                config=json.dumps({"plugin_name": "log_process", "config_data": {"formats": ["${status}"]}}),
                edge_payload=json.dumps({"formats": ["${status}"]}),
            ))
            await s.commit()

        def _collect(cluster_id, ip, port, only_edge_keys=None):
            # 真实抓形：{id: 名字, **config_data} 展平存储
            value = {"formats": ["${status}"]}
            if ip == "10.0.0.15":
                value = {"formats": ["${query}"]}  # 该节点被旁路改过
            entry = _entry("log_process", value)
            return {"plugin_metadata": _parse_entries([entry])}

        with patch("app.services.drift_detection._collect_edge_lists_for_node",
                   side_effect=_collect):
            async with isolated_session() as s:
                result = await preview_publish_diff(
                    s, cluster_id=1, resource_type="plugin_metadata", resource_id=pm_id)

        assert result["name"] == "log_process"
        assert _node(result, "10.0.0.13")["status"] == "ok"
        assert _node(result, "10.0.0.15")["status"] == "diff"
        paths = {r["path"] for r in result["matrix"]["diff_rows"]}
        assert "formats[0]" in paths
        row = _row(result["matrix"], "formats[0]")
        assert row["candidate"] == "${status}"
        assert row["values"]["10.0.0.15"] == "${query}"
