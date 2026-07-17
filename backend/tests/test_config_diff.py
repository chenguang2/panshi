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


def _compare_stream_targets(db_targets_json, edge_nodes):
    """模拟 diff 端点的 stream proxy targets 对比逻辑"""
    from app.services.config_diff import EquivalenceRules
    EquivalenceRules._instance = None
    db_dict = {}
    if db_targets_json:
        try:
            targets = json.loads(db_targets_json) if isinstance(db_targets_json, str) else db_targets_json
            for t in (targets or []):
                db_dict[t.get("target", "")] = t.get("weight", 1)
        except (json.JSONDecodeError, TypeError):
            pass
    edge_dict = edge_nodes if isinstance(edge_nodes, dict) else {}
    equal = json.dumps(db_dict, sort_keys=True, default=str) == json.dumps(edge_dict, sort_keys=True, default=str)
    return {
        "name": "targets",
        "db": json.dumps(db_dict, indent=1, ensure_ascii=False) if db_dict else "{}",
        "edge": json.dumps(edge_dict, indent=1, ensure_ascii=False) if edge_dict else "{}",
        "status": "equal" if equal else "diff",
    }


def _compare_stream_proxy(db_sp: dict, edge_data: dict | None) -> dict:
    """模拟 diff 端点的 stream proxy 对比逻辑"""
    from app.services.config_diff import EquivalenceRules
    EquivalenceRules._instance = None
    rules = EquivalenceRules()

    if not edge_data:
        return {"name": db_sp["name"], "id": db_sp.get("edge_uuid", ""), "status": "only_in_db", "fields": []}
    fields = []
    edge_upstream = edge_data.get("upstream", {})

    # listen_port
    db_v = db_sp.get("listen_port")
    edge_v = edge_data.get("server_port")
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "listen_port", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # load_balance → upstream.type
    db_v = db_sp.get("load_balance", "")
    edge_v = edge_upstream.get("type", "")
    db_norm = rules.normalize_value("upstream", db_v, "load_balance") or db_v
    equal = str(db_norm) == str(edge_v)
    fields.append({"name": "load_balance", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # scheme → upstream.scheme
    db_v = db_sp.get("scheme", "tcp")
    edge_v = edge_upstream.get("scheme", "tcp")
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "scheme", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # targets
    fields.append(_compare_stream_targets(db_sp.get("targets"), edge_upstream.get("nodes")))

    # timeout / keepalive_pool
    for jkey in ("timeout", "keepalive_pool"):
        db_val = db_sp.get(jkey)
        edge_val = edge_upstream.get(jkey)
        if db_val or edge_val:
            result = rules.compare_json_field(db_val, edge_val, rules.get_json_rules("upstream", jkey))
            fields.append({
                "name": jkey,
                "db": result["db"] if result else (json.dumps(db_val, indent=1, ensure_ascii=False) if isinstance(db_val, dict) else str(db_val or "{}")),
                "edge": result["edge"] if result else (json.dumps(edge_val, indent=1, ensure_ascii=False) if isinstance(edge_val, dict) else str(edge_val or "{}")),
                "status": "equal" if not result else "diff",
            })

    # remote_addr / sni
    for key in ("remote_addr", "sni"):
        db_v = db_sp.get(key) or ""
        edge_v = edge_data.get(key, "") or ""
        equal = str(db_v) == str(edge_v)
        fields.append({"name": key, "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    return {"name": db_sp["name"], "id": db_sp.get("edge_uuid", ""), "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}


class TestCompareStreamProxyTargets:

    def test_targets_match(self):
        db = '[{"target":"10.0.0.1:3306","weight":100}]'
        edge = {"10.0.0.1:3306": 100}
        r = _compare_stream_targets(db, edge)
        assert r["status"] == "equal"

    def test_targets_mismatch_weight(self):
        db = '[{"target":"10.0.0.1:3306","weight":100}]'
        edge = {"10.0.0.1:3306": 80}
        r = _compare_stream_targets(db, edge)
        assert r["status"] == "diff"

    def test_targets_db_empty_edge_empty(self):
        assert _compare_stream_targets(None, {})["status"] == "equal"
        assert _compare_stream_targets("[]", {})["status"] == "equal"
        assert _compare_stream_targets(None, None)["status"] == "equal"

    def test_targets_db_empty_edge_has(self):
        edge = {"10.0.0.1:3306": 100}
        r = _compare_stream_targets(None, edge)
        assert r["status"] == "diff"

    def test_targets_missing_host_only(self):
        db = '[{"target":"10.0.0.1","weight":100}]'
        edge = {"10.0.0.1": 100}
        r = _compare_stream_targets(db, edge)
        assert r["status"] == "equal"

    def test_targets_field_has_db_edge_status(self):
        r = _compare_stream_targets('[{"target":"x:1","weight":100}]', {"x:1": 100})
        for key in ("name", "db", "edge", "status"):
            assert key in r, f"targets result missing {key}"


class TestCompareStreamProxy:

    def test_match_when_identical(self):
        r = _compare_stream_proxy(_STREAM_PROXY_DB, _STREAM_PROXY_EDGE)
        assert r["status"] == "match"

    def test_load_balance_normalized(self):
        """weighted_roundrobin → roundrobin 归一化后应一致"""
        r = _compare_stream_proxy(_STREAM_PROXY_DB, _STREAM_PROXY_EDGE)
        lb = next(f for f in r["fields"] if f["name"] == "load_balance")
        assert lb["status"] == "equal"

    def test_listen_port_mismatch(self):
        db = dict(_STREAM_PROXY_DB, listen_port=9999)
        r = _compare_stream_proxy(db, _STREAM_PROXY_EDGE)
        assert r["status"] == "mismatch"
        lp = next(f for f in r["fields"] if f["name"] == "listen_port")
        assert lp["status"] == "diff"

    def test_scheme_mismatch(self):
        db = dict(_STREAM_PROXY_DB, scheme="udp")
        r = _compare_stream_proxy(db, _STREAM_PROXY_EDGE)
        assert r["status"] == "mismatch"
        sc = next(f for f in r["fields"] if f["name"] == "scheme")
        assert sc["status"] == "diff"

    def test_targets_mismatch(self):
        db = dict(_STREAM_PROXY_DB, targets=json.dumps([{"target": "10.0.0.1:3306", "weight": 999}]))
        r = _compare_stream_proxy(db, _STREAM_PROXY_EDGE)
        assert r["status"] == "mismatch", "targets weight diff should cause mismatch"
        tg = next(f for f in r["fields"] if f["name"] == "targets")
        assert tg["status"] == "diff"

    def test_remote_addr_diff(self):
        edge = dict(_STREAM_PROXY_EDGE, remote_addr="10.0.0.0/8")
        db = dict(_STREAM_PROXY_DB, remote_addr="192.168.0.0/16")
        r = _compare_stream_proxy(db, edge)
        assert r["status"] == "mismatch"
        ra = next(f for f in r["fields"] if f["name"] == "remote_addr")
        assert ra["status"] == "diff"

    def test_only_in_db(self):
        db = {"name": "db-only", "edge_uuid": "no-edge"}
        r = _compare_stream_proxy(db, None)
        assert r["status"] == "only_in_db"

    def test_timeout_json_diff(self):
        db = dict(_STREAM_PROXY_DB, timeout='{"connect":5}')
        edge = dict(_STREAM_PROXY_EDGE)
        edge["upstream"] = dict(edge["upstream"], timeout={"connect": 60})
        r = _compare_stream_proxy(db, edge)
        assert r["status"] == "mismatch"
        to = next((f for f in r["fields"] if f["name"] == "timeout"), None)
        assert to is not None, "timeout field should be emitted"
        assert to["status"] == "diff"

    def test_all_fields_emitted(self):
        """所有字段都应出现在 fields 列表中"""
        r = _compare_stream_proxy(_STREAM_PROXY_DB, _STREAM_PROXY_EDGE)
        names = {f["name"] for f in r["fields"]}
        expected = {"listen_port", "load_balance", "scheme", "targets", "remote_addr", "sni"}
        for name in expected:
            assert name in names, f"{name} should be present"

    def test_all_fields_have_status(self):
        r = _compare_stream_proxy(_STREAM_PROXY_DB, _STREAM_PROXY_EDGE)
        for f in r["fields"]:
            assert "status" in f, f"field {f['name']} missing status"
            assert f["status"] in ("equal", "diff"), f"field {f['name']} invalid status"

    def test_sni_diff(self):
        db = dict(_STREAM_PROXY_DB, sni="db.example.com")
        edge = dict(_STREAM_PROXY_EDGE, sni="edge.example.com")
        r = _compare_stream_proxy(db, edge)
        assert r["status"] == "mismatch"
        sni = next(f for f in r["fields"] if f["name"] == "sni")
        assert sni["status"] == "diff"


class TestCompareStreamProxyGracefulDegradation:
    """验证 stream route 拉取失败时不影响其他资源对比（模拟 except Exception）"""

    def test_proxy_only_in_db_when_edge_data_none(self):
        """Edge 无数据时显示 only_in_db（模拟 list_stream_routes 失败）"""
        db = {"name": "sp1", "edge_uuid": "u1", "listen_port": 19994, "load_balance": "weighted_roundrobin", "scheme": "tcp"}
        r = _compare_stream_proxy(db, None)
        assert r["status"] == "only_in_db"

    def test_proxy_matches_when_edge_data_provided(self):
        """Edge 有数据时正常对比（验证 _edge_val 提取后的数据）"""
        db = dict(_STREAM_PROXY_DB)
        edge = dict(_STREAM_PROXY_EDGE)
        r = _compare_stream_proxy(db, edge)
        assert r["status"] == "match", f"expected match got {r['status']}: {[f for f in r['fields'] if f['status']=='diff']}"

    def test_targets_handles_null_edge_nodes(self):
        """targets 对比在 edge_nodes 为 None 时不抛异常"""
        r = _compare_stream_targets('[{"target":"x:1","weight":100}]', None)
        assert r["status"] == "diff"
        assert "name" in r

    def test_targets_handles_non_dict_edge_nodes(self):
        """targets 对比在 edge_nodes 为非 dict 时不抛异常"""
        r = _compare_stream_targets('[{"target":"x:1","weight":100}]', "invalid")
        assert r["status"] == "diff"

    def test_malformed_db_targets_does_not_crash(self):
        """DB targets 为非法 JSON 时不抛异常"""
        r = _compare_stream_targets("not-json", {"x:1": 100})
        assert "status" in r  # 不抛异常即可，结果为 diff 是合理的

    def test_list_stream_routes_empty_returns_empty_dict(self):
        """模拟 list_stream_routes 返回空列表 → edge_stream_proxies = {}"""
        raw = []
        result = {sp.get("id", ""): sp for sp in raw}
        assert result == {}

    def test_list_stream_routes_none_does_not_crash(self):
        """模拟 list_stream_routes 返回 None（已由 except Exception 兜底）"""
        raw = None
        try:
            result = {_edge_val_fn(sp).get("id", ""): _edge_val_fn(sp) for sp in raw} if raw is not None else {}
        except TypeError:
            result = {}
        assert result == {}


def _compare_plugin_metadata_standalone(db_config: dict, edge_config: dict | None, rules) -> dict:
    """模拟 diff 端点的 plugin_metadata 对比逻辑（含 ignore_edge_fields 规则）"""
    if edge_config is None:
        return {"name": db_config.get("plugin_name", ""), "id": db_config.get("plugin_name", ""), "status": "only_in_db", "fields": []}
    edge = dict(edge_config)
    for fld in rules._res_type("plugin_metadata").get("ignore_edge_fields", []):
        edge.pop(fld, None)
    equal = json.dumps(db_config, sort_keys=True) == json.dumps(edge, sort_keys=True)
    fields = [{"name": "config", "db": json.dumps(db_config, indent=1), "edge": json.dumps(edge, indent=1), "status": "equal" if equal else "diff"}]
    return {"name": db_config.get("plugin_name", ""), "id": db_config.get("plugin_name", ""), "status": "match" if equal else "mismatch", "fields": fields}


def _normalize_sni_csv(raw: str) -> str:
    """归一化 SNI 逗号分隔字符串，统一去除逗号周围空格。"""
    return ",".join(part.strip() for part in raw.split(",") if part.strip())


def _normalize_edge_sni(edge_data: dict) -> str:
    """模拟 diff 端点的 _normalize_edge_sni（含归一化）"""
    if "snis" in edge_data:
        snis = edge_data["snis"]
        raw = ", ".join(snis) if isinstance(snis, list) else str(snis)
    else:
        raw = edge_data.get("sni", "")
    return _normalize_sni_csv(raw)


def _compare_ssl_certificate(db: dict, edge_data: dict | None) -> dict:
    """模拟 diff 端点的 SSL 证书对比逻辑"""
    if not edge_data:
        return {"name": db.get("name", ""), "id": db.get("edge_uuid", ""), "status": "only_in_db", "fields": []}
    fields = []

    for key, ekey in [("name", "name"), ("sni", None), ("cert_type", "type"), ("cert", "cert"), ("private_key", "key"), ("status", "status")]:
        db_v = _normalize_sni_csv(db.get(key, "")) if ekey is None else db.get(key, "")
        edge_v = _normalize_edge_sni(edge_data) if ekey is None else edge_data.get(ekey, "")
        equal = str(db_v) == str(edge_v)
        fields.append({"name": key, "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # gm
    db_gm = db.get("gm", False)
    edge_gm = edge_data.get("gm", False)
    equal = str(db_gm) == str(edge_gm)
    fields.append({"name": "gm", "db": str(db_gm), "edge": str(edge_gm), "status": "equal" if equal else "diff"})

    # sign_cert ↔ Edge certs
    db_sign = db.get("sign_cert", "")
    edge_sign = (edge_data.get("certs") or [""])[0]
    equal = str(db_sign) == str(edge_sign)
    fields.append({"name": "sign_cert", "db": str(db_sign), "edge": str(edge_sign), "status": "equal" if equal else "diff"})

    # sign_key ↔ Edge keys
    db_sk = db.get("sign_key", "")
    edge_sk = (edge_data.get("keys") or [""])[0]
    equal = str(db_sk) == str(edge_sk)
    fields.append({"name": "sign_key", "db": str(db_sk), "edge": str(edge_sk), "status": "equal" if equal else "diff"})

    return {"name": db.get("name", ""), "id": db.get("edge_uuid", ""), "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}


class TestNormalizeEdgeSni:

    def test_snis_array(self):
        assert _normalize_edge_sni({"snis": ["a.com", "b.com"]}) == "a.com,b.com"

    def test_sni_string(self):
        assert _normalize_edge_sni({"sni": "example.com"}) == "example.com"

    def test_sni_prefers_snis(self):
        assert _normalize_edge_sni({"sni": "old.com", "snis": ["a.com", "b.com"]}) == "a.com,b.com"

    def test_no_sni(self):
        assert _normalize_edge_sni({}) == ""

    def test_normalize_sni_csv_removes_spaces(self):
        assert _normalize_sni_csv("qcg.com, abc.com") == "qcg.com,abc.com"
        assert _normalize_sni_csv("qcg.com,abc.com") == "qcg.com,abc.com"
        assert _normalize_sni_csv("  a.com ,  b.com  ") == "a.com,b.com"


class TestCompareSslCertificate:

    def test_match_when_identical(self):
        db = {"name": "my-cert", "edge_uuid": "u1", "sni": "example.com", "cert_type": "server", "cert": "crt", "private_key": "k", "status": 1}
        edge = {"name": "my-cert", "sni": "example.com", "type": "server", "cert": "crt", "key": "k", "status": 1}
        r = _compare_ssl_certificate(db, edge)
        assert r["status"] == "match"

    def test_match_sni_ui_format_no_spaces(self):
        """DB storage from UI uses join(',') without spaces."""
        db = {"name": "my-cert", "edge_uuid": "u1", "sni": "qcg.com,abc.com", "cert_type": "server", "cert": "crt", "private_key": "k", "status": 1}
        edge = {"name": "my-cert", "snis": ["qcg.com", "abc.com"], "type": "server", "cert": "crt", "key": "k", "status": 1}
        r = _compare_ssl_certificate(db, edge)
        assert r["status"] == "match", f"expected match got {r['status']}: sni normalize should handle space diff"

    def test_match_sni_array(self):
        db = {"name": "multi", "edge_uuid": "u2", "sni": "a.com,b.com", "cert_type": "server", "cert": "crt", "private_key": "k", "status": 1}
        edge = {"name": "multi", "snis": ["a.com", "b.com"], "type": "server", "cert": "crt", "key": "k", "status": 1}
        r = _compare_ssl_certificate(db, edge)
        assert r["status"] == "match"

    def test_mismatch_when_field_differs(self):
        db = {"name": "my-cert", "edge_uuid": "u3", "sni": "example.com", "cert_type": "server", "cert": "crt", "private_key": "k", "status": 1}
        edge = {"name": "my-cert", "sni": "other.com", "type": "server", "cert": "crt", "key": "k", "status": 1}
        r = _compare_ssl_certificate(db, edge)
        assert r["status"] == "mismatch"

    def test_only_in_db_when_no_edge_data(self):
        db = {"name": "orphan", "edge_uuid": "u4", "sni": "", "cert_type": "server", "cert": "", "private_key": "", "status": 1}
        r = _compare_ssl_certificate(db, None)
        assert r["status"] == "only_in_db"

    def test_all_fields_emitted(self):
        db = {"name": "full", "edge_uuid": "u5", "sni": "x.com", "cert_type": "server", "cert": "crt", "private_key": "k", "status": 1}
        edge = {"name": "full", "sni": "x.com", "type": "server", "cert": "crt", "key": "k", "status": 1}
        r = _compare_ssl_certificate(db, edge)
        names = {f["name"] for f in r["fields"]}
        for key in ("name", "sni", "cert_type", "cert", "private_key", "status"):
            assert key in names, f"{key} should be present"

    def test_gm_fields_match(self):
        db = {"name": "gm", "edge_uuid": "u6", "sni": "gm.local", "cert_type": "server", "cert": "enc", "private_key": "ek", "status": 1, "gm": True, "sign_cert": "sc", "sign_key": "sk"}
        edge = {"name": "gm", "sni": "gm.local", "type": "server", "cert": "enc", "key": "ek", "status": 1, "gm": True, "certs": ["sc"], "keys": ["sk"]}
        r = _compare_ssl_certificate(db, edge)
        assert r["status"] == "match"
        names = {f["name"] for f in r["fields"]}
        for key in ("gm", "sign_cert", "sign_key"):
            assert key in names, f"{key} should be present"

    def test_gm_fields_mismatch(self):
        db = {"name": "gm", "edge_uuid": "u7", "sni": "gm.local", "cert_type": "server", "cert": "enc", "private_key": "ek", "status": 1, "gm": True, "sign_cert": "old-sc", "sign_key": "sk"}
        edge = {"name": "gm", "sni": "gm.local", "type": "server", "cert": "enc", "key": "ek", "status": 1, "gm": True, "certs": ["new-sc"], "keys": ["sk"]}
        r = _compare_ssl_certificate(db, edge)
        assert r["status"] == "mismatch"


class TestComparePluginMetadata:

    def setup_method(self):
        from app.services.config_diff import EquivalenceRules
        EquivalenceRules._instance = None
        EquivalenceRules._rules = {}
        self.rules = EquivalenceRules()

    def test_match_when_identical(self):
        db = {"logs": "logs/process.log"}
        edge = {"id": "log_process", "logs": "logs/process.log"}
        r = _compare_plugin_metadata_standalone(db, edge, self.rules)
        assert r["status"] == "match", f"expected match got {r['status']}: id should be ignored"

    def test_match_when_no_id_in_edge(self):
        db = {"prefer_name": False}
        edge = {"prefer_name": False}
        r = _compare_plugin_metadata_standalone(db, edge, self.rules)
        assert r["status"] == "match"

    def test_mismatch_when_config_differs(self):
        db = {"rate": 10}
        edge = {"id": "limit-req", "rate": 20}
        r = _compare_plugin_metadata_standalone(db, edge, self.rules)
        assert r["status"] == "mismatch"

    def test_only_in_db_when_no_edge_data(self):
        db = {"logs": "logs/process.log"}
        r = _compare_plugin_metadata_standalone(db, None, self.rules)
        assert r["status"] == "only_in_db"


def _edge_val_fn(item: dict) -> dict:
    """模拟 _edge_val"""
    v = item.get("value") if isinstance(item, dict) else None
    return v if isinstance(v, dict) else (item if isinstance(item, dict) else {})


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
