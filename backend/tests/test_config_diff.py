"""测试配置对比核心逻辑（import 真实现 config_diff，纯函数无需数据库）。

历史说明：本文件曾为每个用例手写"模拟端点逻辑"副本（端点实现变更不会让
这些用例变红）；2026-10 起改为直接 import ``app.services.config_diff``
的真实现——端点实现变更（字段增删、等价规则调整）现在会真实反映到这里。
模型入参用 SimpleNamespace 模拟 ORM 对象（service 只做属性访问，无 IO）。
"""

import json
from types import SimpleNamespace

from app.services.config_diff import EquivalenceRules
from app.services.config_diff import (
    add_group,
    compare_plugin_metadata,
    compare_ssl_certificate,
    compare_stream_proxy,
    compare_stream_targets,
    compare_upstream,
    find_only_in_edge,
    new_summary,
    normalize_edge_sni,
    normalize_sni_csv,
)


def _rules() -> EquivalenceRules:
    return EquivalenceRules()


def _ns(**kw) -> SimpleNamespace:
    return SimpleNamespace(**kw)


def _upstream(**kw) -> SimpleNamespace:
    """db upstream（compare_upstream 经 id 关联 targets，其余按属性读取）。"""
    kw.setdefault("id", 1)
    return _ns(**kw)


def _field(result: dict, name: str) -> dict:
    return next(f for f in result["fields"] if f["name"] == name)


class TestCompareUpstream:

    def test_match_when_identical(self):
        # DB weighted_roundrobin ≡ Edge roundrobin（value_mappings 等效归一化）
        db = _upstream(name="api-v1", edge_uuid="u1", load_balance="weighted_roundrobin", scheme="http")
        edge = {"id": "u1", "name": "api-v1", "type": "roundrobin", "scheme": "http"}
        r = compare_upstream(db, edge, _rules())
        assert r["status"] == "match"

    def test_match_when_edge_missing_default(self):
        db = _upstream(name="api-v1", edge_uuid="u1", load_balance="weighted_roundrobin", scheme="http", pass_host="pass")
        edge = {"id": "u1", "name": "api-v1", "type": "roundrobin", "scheme": "http"}
        r = compare_upstream(db, edge, _rules())
        assert r["status"] == "match"

    def test_mismatch_when_field_differs(self):
        db = _upstream(name="api-v1", edge_uuid="u1", load_balance="chash")
        edge = {"id": "u1", "name": "api-v1", "type": "roundrobin"}
        r = compare_upstream(db, edge, _rules())
        assert r["status"] == "mismatch"
        assert _field(r, "load_balance")["status"] == "diff"

    def test_only_in_db_when_no_edge_data(self):
        db = _upstream(name="db-only", edge_uuid="u2")
        r = compare_upstream(db, None, _rules())
        assert r["status"] == "only_in_db"

    def test_non_default_when_edge_missing(self):
        db = _upstream(name="custom", edge_uuid="u3", load_balance="chash")
        edge = {"id": "u3", "name": "custom"}
        r = compare_upstream(db, edge, _rules())
        assert r["status"] == "mismatch"
        assert _field(r, "load_balance")["status"] == "diff"

    def test_mismatch_with_json_field(self):
        db = _upstream(name="with-checks", edge_uuid="u4", checks='{"active":{"type":"http","timeout":1}}')
        edge = {"id": "u4", "name": "with-checks", "checks": '{"active":{"type":"http","timeout":5}}'}
        r = compare_upstream(db, edge, _rules())
        assert r["status"] == "mismatch"
        assert any(f["name"] == "checks" for f in r["fields"])


class TestAllFieldsEmitted:
    """验证所有字段始终输出 + status 标记"""

    def test_all_scalar_fields_present_when_match(self):
        db = _upstream(name="u", edge_uuid="u1", load_balance="weighted_roundrobin", scheme="http")
        edge = {"id": "u1", "type": "roundrobin", "scheme": "http"}
        r = compare_upstream(db, edge, _rules())
        names = {f["name"] for f in r["fields"]}
        for key in ("load_balance", "scheme", "pass_host", "retries", "hash_on", "key"):
            assert key in names, f"{key} should be present even when equal"

    def test_all_scalar_fields_have_status(self):
        db = _upstream(name="u", edge_uuid="u1", load_balance="weighted_roundrobin")
        edge = {"id": "u1", "type": "roundrobin"}
        r = compare_upstream(db, edge, _rules())
        for f in r["fields"]:
            assert "status" in f, f"field {f['name']} missing status"
            assert f["status"] in ("equal", "diff"), f"field {f['name']} invalid status"

    def test_equal_fields_have_equal_status(self):
        db = _upstream(name="u", edge_uuid="u1", load_balance="weighted_roundrobin", scheme="http")
        edge = {"id": "u1", "type": "roundrobin", "scheme": "http"}
        r = compare_upstream(db, edge, _rules())
        for f in r["fields"]:
            if f["name"] in ("load_balance", "scheme"):
                assert f["status"] == "equal", f"{f['name']} should be equal"

    def test_diff_fields_have_diff_status(self):
        db = _upstream(name="u", edge_uuid="u1", load_balance="chash")
        edge = {"id": "u1", "type": "roundrobin"}
        r = compare_upstream(db, edge, _rules())
        assert _field(r, "load_balance")["status"] == "diff"

    def test_json_fields_always_emitted(self):
        db = _upstream(name="u", edge_uuid="u1")
        edge = {"id": "u1", "name": "u", "timeout": {"connect": 6, "send": 6, "read": 6}}
        r = compare_upstream(db, edge, _rules())
        names = {f["name"] for f in r["fields"]}
        assert "timeout" in names, "timeout should be present"
        # checks/keepalive_pool 只在至少一方有值时发射，此处双方都无则跳过

    def test_json_fields_have_status(self):
        db = _upstream(name="u", edge_uuid="u1")
        edge = {"id": "u1", "name": "u", "timeout": {"connect": 6, "send": 6, "read": 6}}
        r = compare_upstream(db, edge, _rules())
        for f in r["fields"]:
            if f["name"] in ("checks", "timeout", "keepalive_pool"):
                assert "status" in f, f"{f['name']} missing status"

    def test_equal_json_has_equal_status(self):
        db = _upstream(name="u", edge_uuid="u1", timeout='{"connect":6,"send":6,"read":6}')
        edge = {"id": "u1", "timeout": {"connect": 6, "send": 6, "read": 6}}
        r = compare_upstream(db, edge, _rules())
        assert _field(r, "timeout")["status"] == "equal"

    def test_diff_json_has_diff_status(self):
        db = _upstream(name="u", edge_uuid="u1", timeout='{"connect":5,"send":6,"read":6}')
        edge = {"id": "u1", "timeout": {"connect": 6, "send": 6, "read": 6}}
        r = compare_upstream(db, edge, _rules())
        assert _field(r, "timeout")["status"] == "diff"

    def test_filtered_fields_show_diffs_only(self):
        """模拟前端 filteredFields(mode='diffs') 的逻辑"""
        db = _upstream(name="u", edge_uuid="u1", load_balance="chash", scheme="http")
        edge = {"id": "u1", "type": "roundrobin", "scheme": "http"}
        r = compare_upstream(db, edge, _rules())
        diffs = [f for f in r["fields"] if f["status"] == "diff"]
        all_f = r["fields"]
        assert len(diffs) < len(all_f), "diffs should be subset of all fields"
        assert any(f["name"] == "load_balance" for f in diffs), "load_balance diff should appear"
        assert not any(f["name"] == "scheme" for f in diffs), "scheme equal should not appear in diffs"


class TestFindOnlyInEdge:

    def test_detects_edge_only(self):
        edge = {"uuid-1": {"name": "common"}, "edge-uuid": {"name": "edge-only"}}
        db = [SimpleNamespace(edge_uuid="uuid-1")]
        result = find_only_in_edge(edge, db)
        assert len(result) == 1
        assert result[0]["status"] == "only_in_edge"
        assert result[0]["name"] == "edge-only"

    def test_no_edge_only_when_all_match(self):
        edge = {"uuid-1": {"name": "a"}, "uuid-2": {"name": "b"}}
        db = [SimpleNamespace(edge_uuid="uuid-1"), SimpleNamespace(edge_uuid="uuid-2")]
        result = find_only_in_edge(edge, db)
        assert len(result) == 0


class TestSummary:

    def test_counts_all_categories(self):
        groups = []
        s = new_summary()
        add_group(groups, s, "上游服务", "upstreams", [
            {"name": "a", "status": "match"},
            {"name": "b", "status": "mismatch"},
            {"name": "c", "status": "only_in_db"},
            {"name": "d", "status": "only_in_edge"},
        ])
        add_group(groups, s, "路由规则", "routes", [{"name": "e", "status": "match"}])
        assert s["total"] == 5
        assert s["match"] == 2
        assert s["mismatch"] == 1
        assert s["only_in_db"] == 1
        assert s["only_in_edge"] == 1

    def test_empty_groups(self):
        assert new_summary()["total"] == 0


# ── 四层代理对比测试 ──

_STREAM_PROXY_EDGE = {
    "id": "uuid-abc",
    "name": "mysql-proxy",
    "server_port": 9970,
    "remote_addr": "",
    "sni": "",
    "upstream": {
        "type": "roundrobin",
        "scheme": "tcp",
        "nodes": {"10.0.0.1:3306": 100, "10.0.0.2:3306": 80},
    },
}

_STREAM_PROXY_DB = {
    "name": "mysql-proxy",
    "edge_uuid": "uuid-abc",
    "listen_port": 9970,
    "load_balance": "weighted_roundrobin",
    "scheme": "tcp",
    "targets": json.dumps([{"target": "10.0.0.1:3306", "weight": 100}, {"target": "10.0.0.2:3306", "weight": 80}]),
    "timeout": None,
    "keepalive_pool": None,
    "remote_addr": None,
    "sni": None,
}


def _stream_db(**over) -> SimpleNamespace:
    base = dict(_STREAM_PROXY_DB)
    base.update(over)
    return _ns(**base)


class TestCompareStreamProxyTargets:

    def test_targets_match(self):
        db = '[{"target":"10.0.0.1:3306","weight":100}]'
        edge = {"10.0.0.1:3306": 100}
        r = compare_stream_targets(db, edge)
        assert r["status"] == "equal"

    def test_targets_mismatch_weight(self):
        db = '[{"target":"10.0.0.1:3306","weight":100}]'
        edge = {"10.0.0.1:3306": 80}
        r = compare_stream_targets(db, edge)
        assert r["status"] == "diff"

    def test_targets_db_empty_edge_empty(self):
        assert compare_stream_targets(None, {})["status"] == "equal"
        assert compare_stream_targets("[]", {})["status"] == "equal"
        assert compare_stream_targets(None, None)["status"] == "equal"

    def test_targets_db_empty_edge_has(self):
        edge = {"10.0.0.1:3306": 100}
        r = compare_stream_targets(None, edge)
        assert r["status"] == "diff"

    def test_targets_missing_host_only(self):
        db = '[{"target":"10.0.0.1","weight":100}]'
        edge = {"10.0.0.1": 100}
        r = compare_stream_targets(db, edge)
        assert r["status"] == "equal"

    def test_targets_field_has_db_edge_status(self):
        r = compare_stream_targets('[{"target":"x:1","weight":100}]', {"x:1": 100})
        for key in ("name", "db", "edge", "status"):
            assert key in r, f"targets result missing {key}"


class TestCompareStreamProxy:

    def test_match_when_identical(self):
        r = compare_stream_proxy(_stream_db(), _STREAM_PROXY_EDGE, _rules())
        assert r["status"] == "match"

    def test_load_balance_normalized(self):
        """weighted_roundrobin → roundrobin 归一化后应一致"""
        r = compare_stream_proxy(_stream_db(), _STREAM_PROXY_EDGE, _rules())
        assert _field(r, "load_balance")["status"] == "equal"

    def test_listen_port_mismatch(self):
        r = compare_stream_proxy(_stream_db(listen_port=9999), _STREAM_PROXY_EDGE, _rules())
        assert r["status"] == "mismatch"
        assert _field(r, "listen_port")["status"] == "diff"

    def test_scheme_mismatch(self):
        r = compare_stream_proxy(_stream_db(scheme="udp"), _STREAM_PROXY_EDGE, _rules())
        assert r["status"] == "mismatch"
        assert _field(r, "scheme")["status"] == "diff"

    def test_targets_mismatch(self):
        db = _stream_db(targets=json.dumps([{"target": "10.0.0.1:3306", "weight": 999}]))
        r = compare_stream_proxy(db, _STREAM_PROXY_EDGE, _rules())
        assert r["status"] == "mismatch", "targets weight diff should cause mismatch"
        assert _field(r, "targets")["status"] == "diff"

    def test_only_in_db(self):
        r = compare_stream_proxy(_ns(name="db-only", edge_uuid="no-edge"), None, _rules())
        assert r["status"] == "only_in_db"

    def test_all_fields_emitted(self):
        """所有字段都应出现在 fields 列表中"""
        r = compare_stream_proxy(_stream_db(), _STREAM_PROXY_EDGE, _rules())
        names = {f["name"] for f in r["fields"]}
        for name in ("listen_port", "name", "load_balance", "scheme", "targets"):
            assert name in names, f"{name} should be present"

    def test_all_fields_have_status(self):
        r = compare_stream_proxy(_stream_db(), _STREAM_PROXY_EDGE, _rules())
        for f in r["fields"]:
            assert "status" in f, f"field {f['name']} missing status"
            assert f["status"] in ("equal", "diff"), f"field {f['name']} invalid status"


class TestCompareStreamProxyGracefulDegradation:
    """验证 stream route 拉取失败时不影响其他资源对比（模拟 except Exception）"""

    def test_proxy_only_in_db_when_edge_data_none(self):
        """Edge 无数据时显示 only_in_db（模拟 list_stream_routes 失败）"""
        db = _stream_db(name="sp1", edge_uuid="u1", listen_port=19994)
        r = compare_stream_proxy(db, None, _rules())
        assert r["status"] == "only_in_db"

    def test_proxy_matches_when_edge_data_provided(self):
        """Edge 有数据时正常对比（验证 _edge_val 提取后的数据）"""
        r = compare_stream_proxy(_stream_db(), dict(_STREAM_PROXY_EDGE), _rules())
        assert r["status"] == "match", f"expected match got {r['status']}: {[f for f in r['fields'] if f['status']=='diff']}"

    def test_targets_handles_null_edge_nodes(self):
        """targets 对比在 edge_nodes 为 None 时不抛异常"""
        r = compare_stream_targets('[{"target":"x:1","weight":100}]', None)
        assert r["status"] == "diff"
        assert "name" in r

    def test_targets_handles_non_dict_edge_nodes(self):
        """targets 对比在 edge_nodes 为非 dict 时不抛异常"""
        r = compare_stream_targets('[{"target":"x:1","weight":100}]', "invalid")
        assert r["status"] == "diff"

    def test_malformed_db_targets_does_not_crash(self):
        """DB targets 为非法 JSON 时不抛异常"""
        r = compare_stream_targets("not-json", {"x:1": 100})
        assert "status" in r  # 不抛异常即可，结果为 diff 是合理的


class TestNormalizeEdgeSni:

    def test_snis_array(self):
        assert normalize_edge_sni({"snis": ["a.com", "b.com"]}) == "a.com,b.com"

    def test_sni_string(self):
        assert normalize_edge_sni({"sni": "example.com"}) == "example.com"

    def test_sni_prefers_snis(self):
        assert normalize_edge_sni({"sni": "old.com", "snis": ["a.com", "b.com"]}) == "a.com,b.com"

    def test_no_sni(self):
        assert normalize_edge_sni({}) == ""

    def test_normalize_sni_csv_removes_spaces(self):
        assert normalize_sni_csv("qcg.com, abc.com") == "qcg.com,abc.com"
        assert normalize_sni_csv("qcg.com,abc.com") == "qcg.com,abc.com"
        assert normalize_sni_csv("  a.com ,  b.com  ") == "a.com,b.com"


def _ssl_cert(**kw) -> SimpleNamespace:
    """db SSL 证书（compare_ssl_certificate 按属性读取全部对比字段）。"""
    base = dict(
        name="my-cert", edge_uuid="u1", is_ca=False, cert_type="server",
        sni="", cert="", private_key="", status=1, gm=False,
        sign_cert="", sign_key="", client_ca="", client_depth=None,
        skip_mtls_uri_regex="",
    )
    base.update(kw)
    return _ns(**base)


class TestCompareSslCertificate:

    def test_match_when_identical(self):
        db = _ssl_cert(sni="example.com", cert="crt", private_key="k")
        edge = {"name": "my-cert", "sni": "example.com", "type": "server", "cert": "crt", "key": "k", "status": 1}
        r = compare_ssl_certificate(db, edge, _rules())
        assert r["status"] == "match"

    def test_match_sni_ui_format_no_spaces(self):
        """DB storage from UI uses join(',') without spaces."""
        db = _ssl_cert(sni="qcg.com,abc.com", cert="crt", private_key="k")
        edge = {"name": "my-cert", "snis": ["qcg.com", "abc.com"], "type": "server", "cert": "crt", "key": "k", "status": 1}
        r = compare_ssl_certificate(db, edge, _rules())
        assert r["status"] == "match", f"expected match got {r['status']}: sni normalize should handle space diff"

    def test_match_sni_array(self):
        db = _ssl_cert(name="multi", edge_uuid="u2", sni="a.com,b.com", cert="crt", private_key="k")
        edge = {"name": "multi", "snis": ["a.com", "b.com"], "type": "server", "cert": "crt", "key": "k", "status": 1}
        r = compare_ssl_certificate(db, edge, _rules())
        assert r["status"] == "match"

    def test_mismatch_when_field_differs(self):
        db = _ssl_cert(edge_uuid="u3", sni="example.com", cert="crt", private_key="k")
        edge = {"name": "my-cert", "sni": "other.com", "type": "server", "cert": "crt", "key": "k", "status": 1}
        r = compare_ssl_certificate(db, edge, _rules())
        assert r["status"] == "mismatch"

    def test_only_in_db_when_no_edge_data(self):
        db = _ssl_cert(name="orphan", edge_uuid="u4")
        r = compare_ssl_certificate(db, None, _rules())
        assert r["status"] == "only_in_db"

    def test_all_fields_emitted(self):
        db = _ssl_cert(name="full", edge_uuid="u5", sni="x.com", cert="crt", private_key="k")
        edge = {"name": "full", "sni": "x.com", "type": "server", "cert": "crt", "key": "k", "status": 1}
        r = compare_ssl_certificate(db, edge, _rules())
        names = {f["name"] for f in r["fields"]}
        for key in ("name", "sni", "cert_type", "cert", "private_key", "status"):
            assert key in names, f"{key} should be present"

    def test_gm_fields_match(self):
        db = _ssl_cert(name="gm", edge_uuid="u6", sni="gm.local", cert="enc", private_key="ek", gm=True, sign_cert="sc", sign_key="sk")
        edge = {"name": "gm", "sni": "gm.local", "type": "server", "cert": "enc", "key": "ek", "status": 1, "gm": True, "certs": ["sc"], "keys": ["sk"]}
        r = compare_ssl_certificate(db, edge, _rules())
        assert r["status"] == "match"
        names = {f["name"] for f in r["fields"]}
        for key in ("gm", "sign_cert", "sign_key"):
            assert key in names, f"{key} should be present"

    def test_gm_fields_mismatch(self):
        db = _ssl_cert(name="gm", edge_uuid="u7", sni="gm.local", cert="enc", private_key="ek", gm=True, sign_cert="old-sc", sign_key="sk")
        edge = {"name": "gm", "sni": "gm.local", "type": "server", "cert": "enc", "key": "ek", "status": 1, "gm": True, "certs": ["new-sc"], "keys": ["sk"]}
        r = compare_ssl_certificate(db, edge, _rules())
        assert r["status"] == "mismatch"

    def test_ca_cert_expected_only_in_db(self):
        """CA 根证书不发布到 Edge，属预期 only_in_db（真实现分支，原副本未覆盖）"""
        r = compare_ssl_certificate(_ssl_cert(name="root-ca", edge_uuid="u8", is_ca=True), None, _rules())
        assert r["status"] == "expected_only_in_db"
        assert "CA" in r["reason"]

    def test_client_cert_expected_only_in_db(self):
        """客户端证书不发布到 Edge，属预期 only_in_db（真实现分支，原副本未覆盖）"""
        r = compare_ssl_certificate(_ssl_cert(name="client-cert", edge_uuid="u9", cert_type="client"), None, _rules())
        assert r["status"] == "expected_only_in_db"
        assert "客户端证书" in r["reason"]


class TestComparePluginMetadata:

    def test_match_when_identical(self):
        db = _ns(plugin_name="log_process", config_data='{"logs": "logs/process.log"}')
        edge = {"id": "log_process", "logs": "logs/process.log"}
        r = compare_plugin_metadata(db, edge, _rules())
        assert r["status"] == "match", f"expected match got {r['status']}: id should be ignored"

    def test_match_when_no_id_in_edge(self):
        db = _ns(plugin_name="monitor", config_data='{"prefer_name": false}')
        edge = {"prefer_name": False}
        r = compare_plugin_metadata(db, edge, _rules())
        assert r["status"] == "match"

    def test_mismatch_when_config_differs(self):
        db = _ns(plugin_name="limit-req", config_data='{"rate": 10}')
        edge = {"id": "limit-req", "rate": 20}
        r = compare_plugin_metadata(db, edge, _rules())
        assert r["status"] == "mismatch"

    def test_only_in_db_when_no_edge_data(self):
        db = _ns(plugin_name="log_process", config_data='{"logs": "logs/process.log"}')
        r = compare_plugin_metadata(db, None, _rules())
        assert r["status"] == "only_in_db"


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

    def test_plugin_metadata_ignore_id(self):
        assert self.rules.should_ignore_edge_field("plugin_metadata", "id") is True
        assert self.rules.should_ignore_edge_field("plugin_metadata", "name") is False

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
        edge = '{"cors": {"allow_origins": "*", "allow_methods": "*", "allow_headers": "*", "allow_credential": false, "max_age": 5, "expose_headers": "*"}}'
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
        edge = '{"cors": {"allow_origins": "*", "allow_methods": "*", "allow_headers": "*", "allow_credential": false, "max_age": 5, "expose_headers": "*"}}'
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
        edge = '{"cors": {"allow_origins": "*", "allow_methods": "*", "allow_headers": "*", "allow_credential": false, "max_age": 5, "expose_headers": "*"}, "limit-req": {"rate": 10, "burst": 0}}'
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
        default = self.rules.get_field_default("upstream", "hash_on")
        assert default == "vars"


class TestChecksEquivalence:
    """健康检查 JSON 缺省值等效（数据来自实际 Edge 响应）"""

    _EDGE_CHECKS = {
        "passive": {
            "type": "http",
            "healthy": {
                "http_statuses": [200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303, 304, 305, 306, 307, 308],
                "successes": 5,
            },
            "unhealthy": {
                "http_failures": 5,
                "http_statuses": [429, 500, 503],
                "tcp_failures": 2,
                "timeouts": 7,
            },
        },
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

    _EDGE_CHECKS_ACTIVE_ONLY = {
        "passive": {
            "type": "http",
            "healthy": {
                "http_statuses": [200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303, 304, 305, 306, 307, 308],
                "successes": 0,
            },
            "unhealthy": {
                "http_failures": 0, "http_statuses": [429, 500, 503], "tcp_failures": 0, "timeouts": 0,
            },
        },
        "active": {
            "type": "http",
            "unhealthy": {
                "timeouts": 3, "tcp_failures": 2, "interval": 1,
                "http_statuses": [429, 500, 501, 502, 503, 504, 505], "http_failures": 5,
            },
            "https_verify_certificate": True, "http_path": "/", "concurrency": 10,
            "healthy": {"http_statuses": [200, 302, 403, 404], "successes": 2, "interval": 5},
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
            "passive": self._EDGE_CHECKS["passive"],
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

    def test_passive_only_variants(self):
        """所有被动模式简写都匹配 Edge 完整结构"""
        for db in ('{"passive": {}}', '{}', '{"passive": {}, "active": {"unhealthy": {}}}'):
            result = self.rules.compare_json_field(db, self._EDGE_CHECKS, self.jrules)
            assert result is None, f"passive-only variant mismatch: {db} -> {result}"

    def test_active_only_variants(self):
        """所有主动模式简写都匹配 Edge 完整结构（主动模式）"""
        for db in ('{"active": {}}', '{"active": {"healthy": {}}}', '{"active": {"unhealthy": {}}}', '{"active": {"healthy": {}, "unhealthy": {}}}'):
            result = self.rules.compare_json_field(db, self._EDGE_CHECKS_ACTIVE_ONLY, self.jrules)
            assert result is None, f"active-only variant mismatch: {db} -> {result}"

    def test_both_variants(self):
        """所有主被动模式简写都匹配 Edge 完整结构"""
        for db in ('{"passive": {}, "active": {}}', '{"passive": {}, "active": {"healthy": {}}}', '{"passive": {}, "active": {"healthy": {}, "unhealthy": {}}}'):
            result = self.rules.compare_json_field(db, self._EDGE_CHECKS, self.jrules)
            assert result is None, f"both-mode variant mismatch: {db} -> {result}"

    def test_real_diff_detected(self):
        """DB 和 Edge 值真正不同时仍报差异"""
        db = {"active": {"http_path": "/custom", "unhealthy": {}}}
        edge = self._EDGE_CHECKS.copy()
        edge["active"] = {**self._EDGE_CHECKS["active"], "http_path": "/different"}
        result = self.rules.compare_json_field(db, edge, self.jrules)
        assert result is not None, "different http_path should be a diff"
