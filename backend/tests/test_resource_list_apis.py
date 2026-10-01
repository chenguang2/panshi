"""四胞胎资源列表 API 合并测试。

原四个同构文件（各 3 例、分组过滤为无种子空转假绿，见
docs/refactoring/test-case-audit-2026-10-01.md §3.5）：
- test_plugin_metadata_api.py    → GET /api/v1/plugin_metadata
- test_plugin_config_list_api.py → GET /api/v1/plugin_configs
- test_global_rule_list_api.py   → GET /api/v1/global_rules
- test_static_resource_list_api.py → GET /api/v1/static_resources

四个端点共用同一实现形态（分页 + group_name 过滤 + cluster_name/cluster_group_name
批量标注），按 resource parametrize 一次覆盖：形状 + cluster 标注 + 分组过滤精确性
（过滤后恰好只剩目标条目 + total 正确 + 未分组语义）。
种子形状取自真实模型字段（app/models/cluster.py、app/models/static_resource.py），
唯一约束差异（plugin_metadata 的 cluster_id+plugin_name、static_resource 的
cluster_id+route_id 可空）在各自工厂函数标注。
"""

import pytest

from app.models.cluster import Cluster, GlobalRule, PluginConfig, PluginMetadata
from app.models.static_resource import StaticResource

GROUP_A = "机电-武清"
GROUP_B = "机电-路局-成都局"
NAME_A = "res-in-wuqing"
NAME_B = "res-in-chengdu"
NAME_UNGROUPED = "res-ungrouped"
DISPLAY_A = "武清集群"
DISPLAY_B = "成都集群"
DISPLAY_UNGROUPED = "无组集群"


def _make_plugin_metadata(cluster_id: int, name: str) -> PluginMetadata:
    """唯一约束 (cluster_id, plugin_name)；config_data 模型默认 "{}"。"""
    return PluginMetadata(cluster_id=cluster_id, plugin_name=name)


def _make_plugin_config(cluster_id: int, name: str) -> PluginConfig:
    """唯一约束 (cluster_id, edge_uuid)；edge_uuid 由模型 default 生成。"""
    return PluginConfig(cluster_id=cluster_id, name=name)


def _make_global_rule(cluster_id: int, name: str) -> GlobalRule:
    """唯一约束 (cluster_id, edge_uuid)；edge_uuid 由模型 default 生成。"""
    return GlobalRule(cluster_id=cluster_id, name=name)


def _make_static_resource(cluster_id: int, name: str) -> StaticResource:
    """唯一约束 (cluster_id, route_id)；route_id 可空（不关联路由）。"""
    return StaticResource(cluster_id=cluster_id, name=name)


RESOURCE_CASES = [
    pytest.param("/plugin_metadata", _make_plugin_metadata, "plugin_name", id="plugin_metadata"),
    pytest.param("/plugin_configs", _make_plugin_config, "name", id="plugin_configs"),
    pytest.param("/global_rules", _make_global_rule, "name", id="global_rules"),
    pytest.param("/static_resources", _make_static_resource, "name", id="static_resources"),
]


async def _seed_three_groups(isolated_session, maker):
    """种 2 个分组集群 + 1 个未分组集群，各挂 1 条目标资源。

    返回 {资源名: (分组, 集群展示名)} 映射。
    """
    async with isolated_session() as s:
        clusters = [
            Cluster(name="wuqing-cluster", display_name=DISPLAY_A, group_name=GROUP_A),
            Cluster(name="chengdu-cluster", display_name=DISPLAY_B, group_name=GROUP_B),
            Cluster(name="bare-cluster", display_name=DISPLAY_UNGROUPED, group_name=""),
        ]
        s.add_all(clusters)
        await s.flush()
        s.add_all([
            maker(clusters[0].id, NAME_A),
            maker(clusters[1].id, NAME_B),
            maker(clusters[2].id, NAME_UNGROUPED),
        ])
        await s.commit()
    return {
        NAME_A: (GROUP_A, DISPLAY_A),
        NAME_B: (GROUP_B, DISPLAY_B),
        NAME_UNGROUPED: ("", DISPLAY_UNGROUPED),
    }


@pytest.mark.parametrize(("endpoint", "maker", "name_field"), RESOURCE_CASES)
class TestResourceListApis:
    """同构列表端点按 resource parametrize：形状、cluster 标注、分组过滤精确性。"""

    async def test_list_all_returns_data(self, async_authed_client, endpoint, maker, name_field):
        response = await async_authed_client.get(f"/api/v1{endpoint}")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert "page" in data
        assert "page_size" in data

    async def test_list_contains_cluster_annotations(self, async_authed_client, isolated_session,
                                                     endpoint, maker, name_field):
        """有种子时每条 item 带正确的 cluster_name / cluster_group_name 标注（防空转假绿）。"""
        expected = await _seed_three_groups(isolated_session, maker)
        response = await async_authed_client.get(f"/api/v1{endpoint}", params={"page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        by_name = {item[name_field]: item for item in data["items"]}
        assert set(by_name) == set(expected)
        for name, (group, cluster_name) in expected.items():
            assert by_name[name]["cluster_name"] == cluster_name
            assert by_name[name]["cluster_group_name"] == group

    async def test_group_filter_returns_only_target_group(self, async_authed_client, isolated_session,
                                                          endpoint, maker, name_field):
        """group_name 过滤后恰好只剩目标分组的条目 + total 正确。"""
        await _seed_three_groups(isolated_session, maker)
        response = await async_authed_client.get(
            f"/api/v1{endpoint}", params={"group_name": GROUP_A, "page_size": 200}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item[name_field] for item in data["items"]] == [NAME_A]
        for item in data["items"]:
            assert item["cluster_group_name"] == GROUP_A

    async def test_group_filter_ungrouped(self, async_authed_client, isolated_session,
                                          endpoint, maker, name_field):
        """group_name=__ung__ 只返回未分组集群（group_name 为 NULL/空串）的条目。"""
        await _seed_three_groups(isolated_session, maker)
        response = await async_authed_client.get(
            f"/api/v1{endpoint}", params={"group_name": "__ung__", "page_size": 200}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item[name_field] for item in data["items"]] == [NAME_UNGROUPED]
        for item in data["items"]:
            assert not item["cluster_group_name"]

    async def test_group_filter_all_matches_unfiltered(self, async_authed_client, isolated_session,
                                                       endpoint, maker, name_field):
        """group_name=__all__ 不过滤：total 与无过滤一致且等于种子总数。"""
        await _seed_three_groups(isolated_session, maker)
        base = await async_authed_client.get(f"/api/v1{endpoint}", params={"page_size": 200})
        assert base.status_code == 200
        assert base.json()["total"] == 3
        filtered = await async_authed_client.get(
            f"/api/v1{endpoint}", params={"group_name": "__all__", "page_size": 200}
        )
        assert filtered.status_code == 200
        assert filtered.json()["total"] == base.json()["total"]
