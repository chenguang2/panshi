## Context

当前 `diff_cluster_config` 函数（`cluster_nodes.py:417`）按以下流程工作：

1. 从 DB 查询集群下所有资源（upstreams/routes/plugin_configs/global_rules/plugin_metadatas）
2. 通过 EdgeClient 从 Edge 节点拉取对应的运行配置
3. 逐项对比，生成包含 status（match/mismatch/only_in_db/only_in_edge）的分组结果
4. 前端 ConfigDiff.vue 按分组展示，支持展开/折叠、字段级差异查看

四层代理与上游/路由等资源的对比模式一致，可以复用相同的对比框架和前端展示逻辑。

## Goals / Non-Goals

**Goals:**
- 四层代理的 DB-vs-Edge 配置对比纳入配置对比功能
- 对比字段：listen_port, load_balance, scheme, targets, timeout, keepalive_pool, remote_addr, sni
- 支持 only_in_db / only_in_edge 检测（通过 edge_uuid 匹配）
- 前端展示四层代理分组，字段标签中文显示

**Non-Goals:**
- 不修改 EdgeClient（list_stream_routes 已存在）
- 不修改对比结果的整体结构和渲染方式
- 不涉及四层代理的发布或编辑

## Decisions

### Decision 1: 在 `diff_cluster_config` 中新增四层代理对比

**选择**：遵循现有对比模式，新增 `_compare_stream_proxy` 函数。

⚠️ **注意：Stream route 的 Edge API 也使用 `{key, value}` 格式**（与其他资源相同），需要通过 `_edge_val()` 提取 `value` 字段获取实际数据。实际数据内部结构与上游/路由不同——配置项嵌套在 `upstream` 子对象中：

```python
# Edge API 返回（外部仍然是 {key, value} 格式）：
{
    "modifiedIndex": 0,
    "value": {                           # ← _edge_val() 提取此层
        "id": "uuid-xxx",               # → DB.edge_uuid
        "name": "mysql-proxy",
        "server_port": 9970,            # → DB.listen_port
        "remote_addr": "10.0.0.0/8",   # → DB.remote_addr
        "sni": "mysql.example.com",    # → DB.sni
        "upstream": {
            "type": "roundrobin",       # → DB.load_balance（需归一化）
            "scheme": "tcp",            # → DB.scheme
            "nodes": {"10.0.0.1:3306": 100},  # → DB.targets
            "timeout": {"connect": 60},
            "keepalive_pool": {"size": 10}
        }
    },
    "createdIndex": 0,
    "key": "/edge/routes/uuid-xxx"
}
```

对比代码采用 inline 风格，与现有 `_compare_upstream` / `_compare_route` 一致：

```python
def _compare_stream_proxy(db_sp, edge_data: dict | None):
    if not edge_data:
        return {"name": db_sp.name, "id": db_sp.edge_uuid, "status": "only_in_db", "fields": []}
    fields = []
    edge_upstream = edge_data.get("upstream", {})
    rules = _rules

    # listen_port → server_port（字段名不同）
    db_v = db_sp.listen_port
    edge_v = edge_data.get("server_port")
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "listen_port", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # load_balance → upstream.type（路径不同，需算法归一化）
    db_v = db_sp.load_balance
    edge_v = edge_upstream.get("type", "")
    db_norm = rules.normalize_value("upstream", db_v, "load_balance") or db_v
    equal = str(db_norm) == str(edge_v)
    fields.append({"name": "load_balance", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # scheme → upstream.scheme
    db_v = db_sp.scheme
    edge_v = edge_upstream.get("scheme", "tcp")
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "scheme", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # targets → upstream.nodes（dict 格式对比）
    fields.append(_compare_stream_targets(db_sp.targets, edge_upstream.get("nodes")))

    # timeout / keepalive_pool → upstream.timeout / upstream.keepalive_pool
    for jkey in ("timeout", "keepalive_pool"):
        db_val = getattr(db_sp, jkey, None)
        edge_val = edge_upstream.get(jkey)
        if db_val or edge_val:
            result = rules.compare_json_field(db_val, edge_val, rules.get_json_rules("upstream", jkey))
            fields.append({
                "name": jkey,
                "db": result["db"] if result else (json.dumps(db_val, indent=1, ensure_ascii=False) if isinstance(db_val, dict) else str(db_val or "{}")),
                "edge": result["edge"] if result else (json.dumps(edge_val, indent=1, ensure_ascii=False) if isinstance(edge_val, dict) else str(edge_val or "{}")),
                "status": "equal" if not result else "diff",
            })

    # remote_addr / sni（顶层字段）
    for key in ("remote_addr", "sni"):
        db_v = getattr(db_sp, key, None) or ""
        edge_v = edge_data.get(key, "") or ""
        equal = str(db_v) == str(edge_v)
        fields.append({"name": key, "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    return {"name": db_sp.name, "id": db_sp.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}
```

**targets 对比**：DB 存储 `[{"target":"ip:port","weight":100}]`，Edge 的 `upstream.nodes` 是 `{"ip:port": weight}` 字典。转换方式与 `edge_import_service.convert_stream_proxy` 一致：

```python
def _compare_stream_targets(db_targets_json, edge_nodes):
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
```

**复用的对比函数**：

| 函数 | 来源 | 用途 |
|---|---|---|
| `rules.normalize_value("upstream", ...)` | 现有 `EquivalenceRules` | 负载均衡算法 `weighted_roundrobin` → `roundrobin` 归一化 |
| `rules.compare_json_field` | 现有 `EquivalenceRules` | timeout / keepalive_pool 的 JSON 字段对比 |
| `rules.get_json_rules("upstream", ...)` | 现有 `EquivalenceRules` | 获取 JSON 字段的默认值和忽略键规则 |
| `_find_only_in_edge` | 现有函数 | 检测 Edge 上有但 DB 中没有的四层代理 |

**Edge 数据构建**：

```python
# stream route 也走 _edge_val 提取 value（{key, value} 格式与其他资源一致）
edge_stream_proxies = {_edge_val(sp).get("id", ""): _edge_val(sp) for sp in client.list_stream_routes()}
```

**only_in_edge 显示名**：`edata.get("name", str(edata.get("server_port", eid)))`

### Decision 2: 使用 `edge_uuid` 匹配 Edge 数据

四层代理与上游/路由共享相同的 `edge_uuid` 关联机制：DB 中每个四层代理记录有自己的 `edge_uuid`，Edge 节点上的 stream route 也有对应的 UUID。通过 `edge_uuid` 匹配确保 DB 和 Edge 上的是同一个资源。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|---|
| **Edge 节点 stream_route API 返回格式与预期不同** | EdgeClient.list_stream_routes() 已在四层代理导入功能中验证过，返回格式已知 |
| **Stream route 数据结构与其他资源完全不同**（嵌套 `upstream` 对象、字段名不一致） | 设计文档按实际 Edge 格式编写代码示例；`server_port` / `upstream.type` / `upstream.nodes` 等映射关系已在 `edge_import_service.convert_stream_proxy()` 中验证过 |
| **负载均衡算法字段名不匹配（DB: weighted_roundrobin, Edge: roundrobin）** | EquivalenceRules 的 `normalize_value("upstream", ...)` 函数已处理此映射，直接复用 |
| **前端分组标签未更新** | 只需在 `fieldLabel` 映射表中增 7-8 行，无结构改动 |
