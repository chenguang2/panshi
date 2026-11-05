"""字段级漂移 diff 纯函数（openspec: config-drift-detection，任务 2.1–2.2）。

语义（design D2，基线驱动）：
- 基线字段在运行态缺失 → removed；两侧都有但值不等 → changed；
- 运行态独有字段不报（Edge 服务端默认展开非旁路修改）；
- 白名单双侧剔除（id/时间戳/etcd 索引等自管理字段）；
- 数值/字符串归一（Edge 回传字符串端口 vs 基线数值等价）；
- 脱敏字段（mask_fields）在输出中以占位符呈现，不回显原文。
"""
import pytest

from app.services.drift_detection import diff_edge_payload


class TestChangedAndRemoved:
    def test_flat_value_change(self):
        diff = diff_edge_payload(
            {"uri": "/a/*", "priority": 0},
            {"uri": "/b/*", "priority": 0},
        )
        assert diff["removed"] == {}
        assert diff["changed"] == [{"path": "uri", "baseline": "/a/*", "edge": "/b/*"}]

    def test_baseline_key_missing_in_edge_is_removed(self):
        diff = diff_edge_payload(
            {"uri": "/a/*", "upstream_id": "uu-1"},
            {"uri": "/a/*"},
        )
        assert diff["removed"] == {"upstream_id": "uu-1"}
        assert diff["changed"] == []

    def test_nested_path_and_list_index(self):
        baseline = {"plugins": {"monitor": {"prefer_name": False, "ports": [1, 2, 3]}}}
        actual = {"plugins": {"monitor": {"prefer_name": True, "ports": [1, 2, 9]}}}
        diff = diff_edge_payload(baseline, actual)
        paths = {c["path"]: c for c in diff["changed"]}
        assert paths["plugins.monitor.prefer_name"]["baseline"] is False
        assert paths["plugins.monitor.prefer_name"]["edge"] is True
        assert paths["plugins.monitor.ports[2]"]["baseline"] == 3
        assert paths["plugins.monitor.ports[2]"]["edge"] == 9

    def test_deep_type_mismatch_is_changed(self):
        diff = diff_edge_payload({"vars": [1, 2]}, {"vars": {"k": 1}})
        assert diff["changed"] == [{"path": "vars", "baseline": [1, 2], "edge": {"k": 1}}]


class TestBaselineDrivenIgnores:
    def test_edge_only_fields_ignored(self):
        """Edge 服务端默认展开（运行态独有字段）不算漂移。"""
        diff = diff_edge_payload(
            {"uri": "/a/*"},
            {"uri": "/a/*", "status": 1, "create_time": 1792472830, "custom_extra": "x"},
        )
        assert diff == {"removed": {}, "changed": []}

    def test_whitelist_strips_both_sides(self):
        diff = diff_edge_payload(
            {"uri": "/a/*", "id": "platform-uuid", "update_time": 111},
            {"uri": "/a/*", "id": "edge-hex-id", "update_time": 222},
            whitelist={"id", "update_time"},
        )
        assert diff == {"removed": {}, "changed": []}


class TestNormalizationAndMasking:
    def test_numeric_string_equivalence(self):
        diff = diff_edge_payload(
            {"listen_port": 9000, "retries": 3},
            {"listen_port": "9000", "retries": "3"},
        )
        assert diff == {"removed": {}, "changed": []}

    def test_numeric_string_difference_still_detected(self):
        diff = diff_edge_payload({"listen_port": 9000}, {"listen_port": "9001"})
        assert diff["changed"] == [{"path": "listen_port", "baseline": 9000, "edge": "9001"}]

    def test_mask_fields_placeholder_output(self):
        diff = diff_edge_payload(
            {"key": "-----BEGIN PRIVATE KEY-----AAA"},
            {"key": "-----BEGIN PRIVATE KEY-----BBB"},
            mask_fields={"key"},
        )
        assert diff["changed"] == [
            {"path": "key", "baseline": "******", "edge": "******"}
        ]

    def test_equal_payloads_empty_diff(self):
        assert diff_edge_payload({"a": {"b": [1, "x"]}}, {"a": {"b": [1, "x"]}}) == {
            "removed": {},
            "changed": [],
        }
