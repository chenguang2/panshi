"""测试配置对比核心逻辑（纯函数，无需数据库）。"""

import json
import pytest

# 字段默认值（与 clusters.py diff 端点保持一致）
_UPSTREAM_DEFAULTS = {"load_balance": "weighted_roundrobin", "scheme": "http", "pass_host": "pass"}


def _compare_upstream(db_u: dict, edge_data: dict | None) -> dict:
    """模拟 diff 端点的 upstream 对比逻辑"""
    if not edge_data:
        return {"name": db_u["name"], "id": db_u["edge_uuid"], "status": "only_in_db", "fields": []}
    fields = []
    for key in ("load_balance", "scheme", "pass_host", "retries", "hash_on", "key"):
        db_v = db_u.get(key)
        edge_v = edge_data.get(key)
        if edge_v is None:
            if db_v is not None and db_v != _UPSTREAM_DEFAULTS.get(key):
                fields.append({"name": key, "db": str(db_v), "edge": "(未配置)"})
            continue
        if str(db_v) != str(edge_v):
            fields.append({"name": key, "db": str(db_v), "edge": str(edge_v)})
    for jkey in ("checks", "timeout", "keepalive_pool"):
        db_v = db_u.get(jkey)
        edge_v = edge_data.get(jkey)
        if db_v or edge_v:
            try:
                db_j = json.loads(db_v) if isinstance(db_v, str) else db_v or {}
                edge_j = edge_v or {}
                if json.dumps(db_j, sort_keys=True) != json.dumps(edge_j, sort_keys=True):
                    fields.append({"name": jkey, "db": json.dumps(db_j, indent=1), "edge": json.dumps(edge_j, indent=1)})
            except (json.JSONDecodeError, TypeError):
                if str(db_v) != str(edge_v):
                    fields.append({"name": jkey, "db": str(db_v), "edge": str(edge_v)})
    return {"name": db_u["name"], "id": db_u["edge_uuid"], "status": "mismatch" if fields else "match", "fields": fields}


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
