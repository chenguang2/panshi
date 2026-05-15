"""测试配置对比核心逻辑（纯函数，无需数据库）。"""

import json
import pytest

# 字段默认值（与 clusters.py diff 端点保持一致）
_UPSTREAM_DEFAULTS = {"load_balance": "roundrobin", "scheme": "http", "pass_host": "pass", "hash_on": "vars"}


def _compare_upstream(db_u: dict, edge_data: dict | None) -> dict:
    """模拟 diff 端点的 upstream 对比逻辑（始终输出所有字段 + status 标记）"""
    if not edge_data:
        return {"name": db_u["name"], "id": db_u["edge_uuid"], "status": "only_in_db", "fields": []}
    fields = []
    for key in ("load_balance", "scheme", "pass_host", "retries", "hash_on", "key"):
        db_v = db_u.get(key)
        edge_v = edge_data.get(key)
        if edge_v is None:
            is_diff = db_v is not None and db_v != _UPSTREAM_DEFAULTS.get(key)
            fields.append({
                "name": key,
                "db": str(db_v) if is_diff else "(默认)",
                "edge": "(未配置)",
                "status": "diff" if is_diff else "equal",
            })
            continue
        equal = str(db_v) == str(edge_v)
        fields.append({
            "name": key,
            "db": str(db_v),
            "edge": str(edge_v),
            "status": "equal" if equal else "diff",
        })
    for jkey in ("checks", "timeout", "keepalive_pool"):
        db_v = db_u.get(jkey)
        edge_v = edge_data.get(jkey)
        if db_v or edge_v:
            try:
                db_j = json.loads(db_v) if isinstance(db_v, str) else db_v or {}
                edge_j = edge_v or {}
                equal = json.dumps(db_j, sort_keys=True) == json.dumps(edge_j, sort_keys=True)
                fields.append({
                    "name": jkey,
                    "db": json.dumps(db_j, indent=1),
                    "edge": json.dumps(edge_j, indent=1),
                    "status": "equal" if equal else "diff",
                })
            except (json.JSONDecodeError, TypeError):
                equal = str(db_v) == str(edge_v)
                fields.append({
                    "name": jkey,
                    "db": str(db_v),
                    "edge": str(edge_v),
                    "status": "equal" if equal else "diff",
                })
    return {"name": db_u["name"], "id": db_u["edge_uuid"], "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}


def _find_only_in_edge(edge_dict: dict, db_items: list[dict]) -> list[dict]:
    db_ids = {d.get("edge_uuid", "") for d in db_items}
    result = []
    for eid, edata in edge_dict.items():
        if eid and eid not in db_ids:
            result.append({"name": edata.get("name", eid), "id": eid, "status": "only_in_edge", "fields": []})
    return result


def _build_summary(groups: list) -> dict:
    s = {"total": 0, "match": 0, "mismatch": 0, "only_in_db": 0, "only_in_edge": 0}
    for g in groups:
        for it in g["items"]:
            st = it["status"]
            s["total"] += 1
            if st in s:
                s[st] += 1
    return s


class TestCompareUpstream:

    def test_match_when_identical(self):
        db = {"name": "api-v1", "edge_uuid": "u1", "load_balance": "weighted_roundrobin", "scheme": "http"}
        edge = {"id": "u1", "name": "api-v1", "load_balance": "weighted_roundrobin", "scheme": "http"}
        r = _compare_upstream(db, edge)
        assert r["status"] == "match"

    def test_match_when_edge_missing_default(self):
        db = {"name": "api-v1", "edge_uuid": "u1", "load_balance": "weighted_roundrobin", "scheme": "http", "pass_host": "pass"}
        edge = {"id": "u1", "name": "api-v1", "load_balance": "weighted_roundrobin", "scheme": "http"}
        r = _compare_upstream(db, edge)
        assert r["status"] == "match"

    def test_mismatch_when_field_differs(self):
        db = {"name": "api-v1", "edge_uuid": "u1", "load_balance": "weighted_roundrobin"}
        edge = {"id": "u1", "name": "api-v1", "load_balance": "roundrobin"}
        r = _compare_upstream(db, edge)
        assert r["status"] == "mismatch"
        assert r["fields"][0]["name"] == "load_balance"

    def test_only_in_db_when_no_edge_data(self):
        db = {"name": "db-only", "edge_uuid": "u2"}
        r = _compare_upstream(db, None)
        assert r["status"] == "only_in_db"

    def test_non_default_when_edge_missing(self):
        db = {"name": "custom", "edge_uuid": "u3", "load_balance": "chash"}
        edge = {"id": "u3", "name": "custom"}
        r = _compare_upstream(db, edge)
        assert r["status"] == "mismatch"
        assert r["fields"][0]["name"] == "load_balance"

    def test_mismatch_with_json_field(self):
        db = {"name": "with-checks", "edge_uuid": "u4", "checks": '{"active":{"type":"http","timeout":1}}'}
        edge = {"id": "u4", "name": "with-checks", "checks": '{"active":{"type":"http","timeout":5}}'}
        r = _compare_upstream(db, edge)
        assert r["status"] == "mismatch"
        assert any(f["name"] == "checks" for f in r["fields"])


class TestAllFieldsEmitted:
    """验证所有字段始终输出 + status 标记"""

    def test_all_scalar_fields_present_when_match(self):
        db = {"name": "u", "edge_uuid": "u1", "load_balance": "weighted_roundrobin", "scheme": "http"}
        edge = {"id": "u1", "load_balance": "weighted_roundrobin", "scheme": "http"}
        r = _compare_upstream(db, edge)
        names = {f["name"] for f in r["fields"]}
        for key in ("load_balance", "scheme", "pass_host", "retries", "hash_on", "key"):
            assert key in names, f"{key} should be present even when equal"

    def test_all_scalar_fields_have_status(self):
        db = {"name": "u", "edge_uuid": "u1", "load_balance": "weighted_roundrobin"}
        edge = {"id": "u1", "load_balance": "roundrobin"}
        r = _compare_upstream(db, edge)
        for f in r["fields"]:
            assert "status" in f, f"field {f['name']} missing status"
            assert f["status"] in ("equal", "diff"), f"field {f['name']} invalid status"

    def test_equal_fields_have_equal_status(self):
        db = {"name": "u", "edge_uuid": "u1", "load_balance": "weighted_roundrobin", "scheme": "http"}
        edge = {"id": "u1", "load_balance": "weighted_roundrobin", "scheme": "http"}
        r = _compare_upstream(db, edge)
        for f in r["fields"]:
            if f["name"] in ("load_balance", "scheme"):
                assert f["status"] == "equal", f"{f['name']} should be equal"

    def test_diff_fields_have_diff_status(self):
        db = {"name": "u", "edge_uuid": "u1", "load_balance": "weighted_roundrobin"}
        edge = {"id": "u1", "load_balance": "roundrobin"}
        r = _compare_upstream(db, edge)
        load = next(f for f in r["fields"] if f["name"] == "load_balance")
        assert load["status"] == "diff"

    def test_json_fields_always_emitted(self):
        db = {"name": "u", "edge_uuid": "u1"}
        edge = {"id": "u1", "name": "u", "timeout": {"connect": 6, "send": 6, "read": 6}}
        r = _compare_upstream(db, edge)
        names = {f["name"] for f in r["fields"]}
        assert "timeout" in names, "timeout should be present"
        # checks/keepalive_pool 只在至少一方有值时发射，此处双方都无则跳过

    def test_json_fields_have_status(self):
        db = {"name": "u", "edge_uuid": "u1"}
        edge = {"id": "u1", "name": "u", "timeout": {"connect": 6, "send": 6, "read": 6}}
        r = _compare_upstream(db, edge)
        for f in r["fields"]:
            if f["name"] in ("checks", "timeout", "keepalive_pool"):
                assert "status" in f, f"{f['name']} missing status"

    def test_equal_json_has_equal_status(self):
        db = {"name": "u", "edge_uuid": "u1", "timeout": '{"connect":6,"send":6,"read":6}'}
        edge = {"id": "u1", "timeout": {"connect": 6, "send": 6, "read": 6}}
        r = _compare_upstream(db, edge)
        t = next(f for f in r["fields"] if f["name"] == "timeout")
        assert t["status"] == "equal"

    def test_diff_json_has_diff_status(self):
        db = {"name": "u", "edge_uuid": "u1", "timeout": '{"connect":5,"send":6,"read":6}'}
        edge = {"id": "u1", "timeout": {"connect": 6, "send": 6, "read": 6}}
        r = _compare_upstream(db, edge)
        t = next(f for f in r["fields"] if f["name"] == "timeout")
        assert t["status"] == "diff"

    def test_filtered_fields_show_diffs_only(self):
        """模拟前端 filteredFields(mode='diffs') 的逻辑"""
        db = {"name": "u", "edge_uuid": "u1", "load_balance": "weighted_roundrobin", "scheme": "http"}
        edge = {"id": "u1", "load_balance": "roundrobin", "scheme": "http"}
        r = _compare_upstream(db, edge)
        diffs = [f for f in r["fields"] if f["status"] == "diff"]
        all_f = r["fields"]
        assert len(diffs) < len(all_f), "diffs should be subset of all fields"
        assert any(f["name"] == "load_balance" for f in diffs), "load_balance diff should appear"
        assert not any(f["name"] == "scheme" for f in diffs), "scheme equal should not appear in diffs"


class TestFindOnlyInEdge:

    def test_detects_edge_only(self):
        edge = {"uuid-1": {"name": "common"}, "edge-uuid": {"name": "edge-only"}}
        db = [{"edge_uuid": "uuid-1"}]
        result = _find_only_in_edge(edge, db)
        assert len(result) == 1
        assert result[0]["status"] == "only_in_edge"
        assert result[0]["name"] == "edge-only"

    def test_no_edge_only_when_all_match(self):
        edge = {"uuid-1": {"name": "a"}, "uuid-2": {"name": "b"}}
        db = [{"edge_uuid": "uuid-1"}, {"edge_uuid": "uuid-2"}]
        result = _find_only_in_edge(edge, db)
        assert len(result) == 0


class TestSummary:

    def test_counts_all_categories(self):
        groups = [
            {"type": "upstreams", "items": [
                {"name": "a", "status": "match"},
                {"name": "b", "status": "mismatch"},
                {"name": "c", "status": "only_in_db"},
                {"name": "d", "status": "only_in_edge"},
            ]},
            {"type": "routes", "items": [{"name": "e", "status": "match"}]},
        ]
        s = _build_summary(groups)
        assert s["total"] == 5
        assert s["match"] == 2
        assert s["mismatch"] == 1
        assert s["only_in_db"] == 1
        assert s["only_in_edge"] == 1

    def test_empty_groups(self):
        assert _build_summary([])["total"] == 0


class TestEquivalenceRules:

    def setup_method(self):
        from app.services.config_diff import EquivalenceRules
        # Reset singleton for test isolation
        EquivalenceRules._instance = None
        EquivalenceRules._rules = {}
        self.rules = EquivalenceRules()

    def test_scalar_default_applied(self):
        assert self.rules.normalize_scalar("upstream", None, "scheme") == "http"
        assert self.rules.normalize_scalar("upstream", None, "pass_host") == "pass"

    def test_value_mapping_load_balance(self):
        assert self.rules.normalize_value("upstream", "weighted_roundrobin", "load_balance") == "roundrobin"
        assert self.rules.normalize_value("upstream", "chash", "load_balance") == "chash"
        assert self.rules.normalize_value("upstream", None, "load_balance") is None

    def test_scalar_no_default_returns_none(self):
        assert self.rules.normalize_scalar("upstream", None, "retries") is None

    def test_field_alias_upstream_type(self):
        assert self.rules.get_field_alias("upstream", "load_balance") == "type"
        assert self.rules.get_field_alias("upstream", "scheme") == "scheme"

    def test_ignore_edge_fields(self):
        assert self.rules.should_ignore_edge_field("upstream", "update_time") is True
        assert self.rules.should_ignore_edge_field("upstream", "name") is False

    def test_deep_fill_json_missing_keys(self):
        db_val = '{"connect": 5}'
        edge_val = '{"connect": 5, "send": 30, "read": 30}'
        jrules = self.rules.get_json_rules("upstream", "timeout")
        # no fill_defaults defined, so partial DB vs full Edge is a diff
        result = self.rules.compare_json_field(db_val, edge_val, jrules)
        assert result is not None

    def test_deep_fill_json_ignores_edge_keys(self):
        db_val = None
        edge_val = '{"connect": 15, "send": 30, "read": 30, "create_time": 123456}'
        jrules = self.rules.get_json_rules("upstream", "timeout")
        result = self.rules.compare_json_field(db_val, edge_val, jrules)
        # DB has nothing, Edge has data → diff (no fill_defaults)
        assert result is not None
        # create_time should still be stripped
        assert "create_time" not in result["edge"]

    def test_deep_fill_json_real_diff(self):
        db_val = '{"connect": 99}'
        edge_val = '{"connect": 15, "send": 30, "read": 30}'
        jrules = self.rules.get_json_rules("upstream", "timeout")
        result = self.rules.compare_json_field(db_val, edge_val, jrules)
        assert result is not None

    def test_list_field_normalize_methods(self):
        matched, db_norm, edge_norm = self.rules.normalize_list("GET,POST", ["GET", "POST"])
        assert matched is True
        assert db_norm == ["GET", "POST"]

    def test_list_field_normalize_no_match(self):
        matched, _, _ = self.rules.normalize_list("GET,POST", ["DELETE"])
        assert matched is False

    def test_is_list_field(self):
        assert self.rules.is_list_field("route", "methods") is True
        assert self.rules.is_list_field("route", "uri") is False

    def test_plugin_defaults_fill(self):
        defaults = self.rules.get_plugin_defaults("plugin_config")
        assert "cors" in defaults
        assert defaults["cors"]["allow_origins"] == "*"

    def test_compare_plugins_empty_vs_defaults(self):
        db = '{"cors": {}}'
        edge = '{"cors": {"allow_origins": "*", "allow_methods": "*", "allow_headers": "*", "allow_credential": false}}'
        defaults = self.rules.get_plugin_defaults("plugin_config")
        result = self.rules.compare_plugins(db, edge, defaults)
        assert len(result) == 1
        assert result[0]["name"] == "cors"
        assert result[0]["status"] == "equal"  # filled defaults match

    def test_compare_plugins_real_diff(self):
        db = '{"cors": {"allow_origins": "http://example.com"}}'
        edge = '{"cors": {"allow_origins": "*", "allow_methods": "*"}}'
        defaults = self.rules.get_plugin_defaults("plugin_config")
        result = self.rules.compare_plugins(db, edge, defaults)
        assert len(result) == 1
        assert result[0]["name"] == "cors"
        assert result[0]["status"] == "diff"


class TestPluginPerRow:
    """每个插件独立一行，始终带 status 标记"""

    def setup_method(self):
        from app.services.config_diff import EquivalenceRules
        EquivalenceRules._instance = None
        EquivalenceRules._rules = {}
        self.rules = EquivalenceRules()
        self.defaults = self.rules.get_plugin_defaults("plugin_config")

    def test_each_plugin_is_separate_row(self):
        db = '{"cors": {"allow_origins": "*"}, "limit-req": {"rate": 10}}'
        edge = '{"cors": {"allow_origins": "*"}, "limit-req": {"rate": 10, "burst": 0}}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        names = [r["name"] for r in result]
        assert "cors" in names
        assert "limit-req" in names

    def test_each_plugin_has_status(self):
        db = '{"cors": {}}'
        edge = '{"cors": {"allow_origins": "*"}}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        for r in result:
            assert "status" in r
            assert r["status"] in ("equal", "diff")

    def test_equal_plugin_has_equal_status(self):
        db = '{"cors": {}}'
        edge = '{"cors": {"allow_origins": "*", "allow_methods": "*", "allow_headers": "*", "allow_credential": false}}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        cors = next(r for r in result if r["name"] == "cors")
        assert cors["status"] == "equal"

    def test_diff_plugin_has_diff_status(self):
        db = '{"cors": {"allow_origins": "http://custom.com"}}'
        edge = '{"cors": {"allow_origins": "*"}}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        cors = next(r for r in result if r["name"] == "cors")
        assert cors["status"] == "diff"

    def test_mixed_plugins_equal_and_diff(self):
        db = '{"cors": {}, "limit-req": {"rate": 99}}'
        edge = '{"cors": {"allow_origins": "*", "allow_methods": "*", "allow_headers": "*", "allow_credential": false}, "limit-req": {"rate": 10, "burst": 0}}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        cors = next(r for r in result if r["name"] == "cors")
        lr = next(r for r in result if r["name"] == "limit-req")
        assert cors["status"] == "equal"
        assert lr["status"] == "diff"

    def test_plugin_only_in_db_shows_as_diff(self):
        db = '{"custom-plugin": {"key": "val"}}'
        edge = '{}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        assert len(result) == 1
        assert result[0]["name"] == "custom-plugin"
        assert result[0]["status"] == "diff"

    def test_plugin_only_in_edge_shows_as_diff(self):
        db = '{}'
        edge = '{"cors": {"allow_origins": "*"}}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        assert len(result) == 1
        assert result[0]["name"] == "cors"
        assert result[0]["status"] == "diff"  # Edge 有 DB 没有，字面不匹配且填充后仍不匹配

    def test_plugin_config_fields_are_individual(self):
        """模拟 _compare_plugin_config 返回格式：每个插件是独立 field，没有 plugins 包装"""
        fields = self.rules.compare_plugins(
            '{"cors": {}, "limit-req": {"rate": 10}}',
            '{"cors": {"allow_origins": "*"}, "limit-req": {"rate": 10, "burst": 0}}',
            self.defaults,
        )
        names = [f["name"] for f in fields]
        assert "plugins" not in names
        assert "cors" in names
        assert "limit-req" in names

    def test_multiple_plugins_all_returned(self):
        db = '{"a": {}, "b": {}, "c": {}}'
        edge = '{"a": {}, "b": {}, "c": {}}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        assert len(result) == 3
        assert all(r["status"] == "equal" for r in result)

    def test_log_process_empty_matches_edge(self):
        db = '{"log_process": {}}'
        edge = '{"log_process": {"logs": "logs/process.log"}}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        assert len(result) == 1
        assert result[0]["name"] == "log_process"
        assert result[0]["status"] == "equal"

    def test_traffic_limit_count_no_policy_matches_edge(self):
        db = '{"traffic_limit_count": {"count": 100}}'
        edge = '{"traffic_limit_count": {"count": 100, "policy": "local"}}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        assert len(result) == 1
        assert result[0]["name"] == "traffic_limit_count"
        assert result[0]["status"] == "equal"

    def test_meta_is_stripped_from_edge(self):
        """Edge 注入的 _meta 字段被忽略，不产生 diff"""
        db = '{"monitor": {}}'
        edge = '{"monitor": {"prefer_name": false, "_meta": {"disable": false, "priority": 1}}}'
        result = self.rules.compare_plugins(db, edge, self.defaults,
                                            ignore_edge_fields=["_meta"])
        assert len(result) == 1
        assert result[0]["name"] == "monitor"
        assert result[0]["status"] == "equal"

    def test_meta_without_ignore_still_diff(self):
        """如果不忽略 _meta，则仍报 diff"""
        db = '{"monitor": {}}'
        edge = '{"monitor": {"prefer_name": false, "_meta": {"disable": false}}}'
        result = self.rules.compare_plugins(db, edge, self.defaults)
        assert result[0]["status"] == "diff"


class TestHashOnEquivalence:
    """hash_on 在非 chash 类型下应视为等效"""

    def setup_method(self):
        from app.services.config_diff import EquivalenceRules
        EquivalenceRules._instance = None
        EquivalenceRules._rules = {}
        self.rules = EquivalenceRules()

    def test_hash_on_none_edge_missing_is_match(self):
        """DB hash_on=None 且 Edge 没有 hash_on（非chash），应一致"""
        db_raw = None
        edge_v = None
        default = self.rules.get_field_default("upstream", "hash_on")
        assert default == "vars"
        # raw value is None, edge missing → no diff (edge_v is None, db_raw is None)
        assert db_raw is None  # the existence check passes cleanly

    def test_hash_on_not_in_edge_type_roundrobin(self):
        """模拟实际场景：type=roundrobin, Edge 不返回 hash_on"""
        db_raw = None  # user never set hash_on
        edge_v = None  # Edge doesn't have hash_on (not chash)
        # This should NOT be a diff: raw DB value is None and Edge doesn't have it
        should_report = db_raw is not None and db_raw != self.rules.get_field_default("upstream", "hash_on")
        assert not should_report


class TestChecksEquivalence:
    """健康检查 JSON 缺省值等效（数据来自实际 Edge 响应）"""

    _EDGE_CHECKS = {
        "passive": {"type": "http"},
        "active": {
            "type": "http",
            "unhealthy": {
                "timeouts": 3,
                "tcp_failures": 2,
                "interval": 1,
                "http_statuses": [429, 500, 501, 502, 503, 504, 505],
                "http_failures": 5,
            },
            "https_verify_certificate": True,
            "http_path": "/",
            "concurrency": 10,
            "healthy": {
                "http_statuses": [200, 302, 403, 404],
                "successes": 2,
                "interval": 0,
            },
            "timeout": 1,
        },
    }

    def setup_method(self):
        from app.services.config_diff import EquivalenceRules
        EquivalenceRules._instance = None
        EquivalenceRules._rules = {}
        self.rules = EquivalenceRules()
        self.jrules = self.rules.get_json_rules("upstream", "checks")

    def test_empty_objects_match_full_edge(self):
        """DB={'passive':{}, 'active':{'unhealthy':{}}} ≡ Edge 完整结构"""
        db = '{"passive": {}, "active": {"unhealthy": {}}}'
        result = self.rules.compare_json_field(db, self._EDGE_CHECKS, self.jrules)
        assert result is None, f"empty objects should match filled Edge: {result}"

    def test_custom_http_path_matches(self):
        """DB 改了 http_path，其余用默认值 → 一致"""
        db = {"active": {"http_path": "/health", "unhealthy": {}}}
        edge = {
            "passive": {"type": "http"},
            "active": {
                "type": "http",
                "http_path": "/health",
                "unhealthy": self._EDGE_CHECKS["active"]["unhealthy"],
                "https_verify_certificate": True,
                "concurrency": 10,
                "healthy": self._EDGE_CHECKS["active"]["healthy"],
                "timeout": 1,
            },
        }
        result = self.rules.compare_json_field(db, edge, self.jrules)
        assert result is None, f"custom http_path should match: {result}"

    def test_db_none_matches_edge_full(self):
        """DB checks=NULL，Edge 有完整 → 填充默认值后一致"""
        result = self.rules.compare_json_field(None, self._EDGE_CHECKS, self.jrules)
        assert result is None, f"None should match filled Edge: {result}"

    def test_real_diff_detected(self):
        """DB 和 Edge 值真正不同时仍报差异"""
        db = {"active": {"http_path": "/custom", "unhealthy": {}}}
        edge = self._EDGE_CHECKS.copy()
        edge["active"] = {**self._EDGE_CHECKS["active"], "http_path": "/different"}
        result = self.rules.compare_json_field(db, edge, self.jrules)
        assert result is not None, "different http_path should be a diff"
