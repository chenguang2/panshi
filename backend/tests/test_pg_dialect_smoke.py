"""PG 方言 / 严格类型冒烟（opt-in 加强模式）。

把「SQLite 弱类型容忍、PostgreSQL 严格类型才暴露」的写路径固化为**可重复回归**，
替代 2026-09-17 事故排查时的手工 curl 冒烟。

运行方式::

    # 默认：会话级临时 SQLite（快，不做方言信号）
    uv run pytest tests/test_pg_dialect_smoke.py -q

    # PG 专用 schema（真正的方言信号；DSN 取 PG_DSN 或活动 PG 连接）
    TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q
    # schema 默认 pan shi_test，可用 TEST_DB_PG_SCHEMA 覆盖；跑完自动 DROP SCHEMA CASCADE

覆盖的风险类别（均有真实事故对应）:

1. **审计骨架 path param `str` → Integer 列**：2026-09-17 切 PG 后，全站带路径 id 的写操作
   在 PG 下报 401「未认证」（asyncpg 严格类型拒绝 str 绑定，异常被鉴权依赖吞掉）。
2. **`Dict` schema + `TEXT` 列未序列化**：同日 `stream_proxies.timeout/keepalive_pool`
   漏 `json.dumps` → PG 绑参 `expected str, got dict` → 500（SQLite 时代被弱类型掩盖）。
3. **JSON 字段 round-trip**：`vars` / `plugin_config_ids` / `plugins` / `checks` 等
   写入后能否原样读回（序列化 ↔ 反序列化对称）。
4. **asyncpg 连接语义**：跨事件循环/并发复用连接会报
   `InterfaceError: another operation is in progress`（全局隔离用 NullPool 规避）。
"""
import time
import uuid

import pytest


def _assert_created(resp, label: str) -> dict:
    assert resp.status_code in (200, 201), f"{label} 失败: {resp.status_code} {resp.text}"
    return resp.json()


@pytest.fixture
def cluster(global_engine_client):
    """一次性冒烟集群；测毕经 API 删除（delete_db + delete_edge）。"""
    resp = global_engine_client.post(
        "/api/v1/clusters",
        json={"name": f"zz-pg-smoke-{int(time.time())}-{uuid.uuid4().hex[:6]}", "display_name": "PG 方言冒烟"},
    )
    cid = _assert_created(resp, "建集群")["id"]
    yield cid
    global_engine_client.request(
        "DELETE",
        f"/api/v1/clusters/{cid}",
        json={"delete_db": True, "delete_edge": True},
    )


def test_isolation_backend_matches_request(test_db_backend, global_engine_dialect):
    """隔离后端必须与 TEST_DB_BACKEND 一致（防"以为在跑 PG，实际在跑 SQLite"）。"""
    expected = "postgresql" if test_db_backend == "pg" else "sqlite"
    assert global_engine_dialect == expected, (
        f"TEST_DB_BACKEND={test_db_backend} 但隔离引擎方言为 {global_engine_dialect}"
    )


def test_cluster_write_paths(global_engine_client, cluster):
    """集群改/删：覆盖带路径 id 的写路径（风险类别 1）。"""
    put = global_engine_client.put(f"/api/v1/clusters/{cluster}", json={"display_name": "PG 方言冒烟（改）"})
    assert put.status_code == 200, put.text
    assert put.json()["display_name"] == "PG 方言冒烟（改）"


def test_node_write_paths(global_engine_client, cluster):
    """节点建/改/删：双路径 id（cluster_id + node_id），审计骨架最易踩坑。"""
    created = _assert_created(
        global_engine_client.post(
            f"/api/v1/clusters/{cluster}/nodes",
            json={
                "ip": "10.255.255.1",
                "service_port": 80,
                "management_port": 9090,
                "ssh_port": 22,
                "edge_path": "/usr/local/edge",
            },
        ),
        "建节点",
    )
    node_id = created["id"]

    put = global_engine_client.put(
        f"/api/v1/clusters/{cluster}/nodes/{node_id}",
        json={
            "ip": "10.255.255.1",
            "service_port": 80,
            "management_port": 9090,
            "ssh_port": 22,
            "edge_path": "/usr/local/edge",
            "status": 1,
        },
    )
    assert put.status_code == 200, put.text

    deleted = global_engine_client.request(
        "DELETE",
        f"/api/v1/clusters/{cluster}/nodes/{node_id}",
        json={"delete_db": True, "delete_edge": False},
    )
    assert deleted.status_code in (200, 204), deleted.text


def test_upstream_json_dict_fields_round_trip(global_engine_client, cluster):
    """上游 checks/timeout/keepalive_pool（Dict + TEXT 列，风险类别 2/3）。"""
    payload = {
        "name": "zz-pg-smoke-up",
        "targets": [{"target": "127.0.0.1:8080", "weight": 1}],
        "checks": {"active": {"type": "http", "http_path": "/health"}},
        "timeout": {"connect": 3, "send": 3, "read": 3},
        "keepalive_pool": {"size": 16, "idle_timeout": 60},
    }
    created = _assert_created(global_engine_client.post(f"/api/v1/clusters/{cluster}/upstreams", json=payload), "建上游")
    upstream_id = created["id"]

    listed = global_engine_client.get(f"/api/v1/clusters/{cluster}/upstreams")
    assert listed.status_code == 200, listed.text
    item = next(u for u in listed.json()["items"] if u["id"] == upstream_id)
    assert item["timeout"] == payload["timeout"], item.get("timeout")
    assert item["keepalive_pool"] == payload["keepalive_pool"], item.get("keepalive_pool")
    assert item["checks"] == payload["checks"], item.get("checks")


def test_route_json_list_fields_round_trip(global_engine_client, cluster):
    """路由 vars（list）+ plugin_config_ids（list，风险类别 3）。"""
    payload = {
        "name": "zz-pg-smoke-route",
        "uri": "/zz-pg-smoke/*",
        "vars": [["arg_debug", "==", "1"]],
        "plugin_config_ids": ["11111111-2222-3333-4444-555555555555"],
    }
    created = _assert_created(global_engine_client.post(f"/api/v1/clusters/{cluster}/routes", json=payload), "建路由")
    route_id = created["id"]

    put = global_engine_client.put(
        f"/api/v1/clusters/{cluster}/routes/{route_id}",
        json={"vars": [["arg_debug", "==", "0"], ["arg_env", "==", "prod"]]},
    )
    assert put.status_code == 200, put.text
    assert put.json()["vars"] == [["arg_debug", "==", "0"], ["arg_env", "==", "prod"]]

    deleted = global_engine_client.request(
        "DELETE",
        f"/api/v1/clusters/{cluster}/routes/{route_id}",
        json={"delete_db": True, "delete_edge": False},
    )
    assert deleted.status_code in (200, 204), deleted.text


def test_plugin_config_and_global_rule_plugins_round_trip(global_engine_client, cluster):
    """插件组 / 全局规则 plugins（Dict + TEXT 列，风险类别 2/3）。"""
    plugins = {"proxy-rewrite": {"regex_uri": ["^/old/(.*)", "/new/$1"]}, "limit-req": {"rate": 10}}

    pc = _assert_created(
        global_engine_client.post(
            f"/api/v1/clusters/{cluster}/plugin_configs", json={"name": "zz-pg-smoke-pc", "plugins": plugins}
        ),
        "建插件组",
    )
    assert pc["plugins"] == plugins, pc.get("plugins")

    gr = _assert_created(
        global_engine_client.post(
            f"/api/v1/clusters/{cluster}/global_rules", json={"name": "zz-pg-smoke-gr", "plugins": plugins}
        ),
        "建全局规则",
    )
    assert gr["plugins"] == plugins, gr.get("plugins")

    # 带路径 id 的删除（风险类别 1）
    pc_del = global_engine_client.request(
        "DELETE",
        f"/api/v1/clusters/{cluster}/plugin_configs/{pc['id']}",
        json={"delete_db": True, "delete_edge": False},
    )
    assert pc_del.status_code in (200, 204), pc_del.text
    gr_del = global_engine_client.request(
        "DELETE",
        f"/api/v1/clusters/{cluster}/global_rules/{gr['id']}",
        json={"delete_db": True, "delete_edge": False},
    )
    assert gr_del.status_code in (200, 204), gr_del.text


def test_stream_proxy_timeout_dict_fields_round_trip(global_engine_client, cluster):
    """四层代理 timeout/keepalive_pool（**回归守卫**：曾因漏 json.dumps 在 PG 下 500）。"""
    payload = {
        "name": "zz-pg-smoke-sp",
        "listen_port": 18765,
        "timeout": {"connect": 5, "send": 10, "read": 30},
        "keepalive_pool": {"size": 8, "idle_timeout": 45},
    }
    created = _assert_created(
        global_engine_client.post(f"/api/v1/clusters/{cluster}/stream-proxies", json=payload), "建四层代理"
    )
    proxy_id = created["id"]

    put = global_engine_client.put(
        f"/api/v1/clusters/{cluster}/stream-proxies/{proxy_id}",
        json={"timeout": {"connect": 6, "send": 11, "read": 31}},
    )
    assert put.status_code == 200, put.text

    listed = global_engine_client.get(f"/api/v1/clusters/{cluster}/stream-proxies")
    assert listed.status_code == 200, listed.text
    item = next(p for p in listed.json()["items"] if p["id"] == proxy_id)
    assert item["timeout"] == {"connect": 6, "send": 11, "read": 31}, item.get("timeout")
