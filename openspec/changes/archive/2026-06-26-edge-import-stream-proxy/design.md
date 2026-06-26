## Context

EdgeImport 流程：
1. **测试连接** — 从 Edge 节点读取各资源数量
2. **预览导入** — 从 Edge 节点抓取数据 → 转换为 DB 格式 → 检测冲突
3. **执行导入** — 按顺序写入 DB：plugin_metadata → plugin_configs → global_rules → upstreams → routes

四层代理（Stream Route）的 Edge 管理 API 为 `/stream/edge/admin/routes`，EdgeClient 已有 `list_stream_routes()`、`get_stream_route()`、`delete_stream_route()` 等方法。

## Goals / Non-Goals

**Goals:**
- 数据导入支持四层代理的抓取、预览、冲突检测和导入
- 复用 `EdgeClient.list_stream_routes()` 获取 Edge 节点上的 Stream Route 列表
- 与现有导入 UI 风格一致，在配置类型选择中增加四层代理卡片

**Non-Goals:**
- 不修改已归档的 StreamProxy 业务页面
- 不修改 EdgeClient 类（已有 stream_route 方法）

## Decisions

### 1. 数据格式转换
**选择**：Edge 节点的 Stream Route 结构转换为 `ps_stream_proxy` 表对应的 DB 格式
**理由**：与已有的 upstream/route 转换模式一致。

```
Edge API 返回格式（含 value/key 包装，与 HTTP 路由一致）：
{
  "value": {
    "name": "qcg-test-stream",
    "id": "bd38d68a-88e2-48b1-a2f5-26c2915be77e",
    "server_port": 19993,
    "upstream": {
      "scheme": "tcp",
      "type": "roundrobin",
      "pass_host": "pass",
      "nodes": {"127.0.0.1:19992": 100},
      "timeout": {"connect": 60, "send": 60, "read": 60}
    }
  },
  "key": "/edge/routes/bd38d68a-88e2-48b1-a2f5-26c2915be77e"
}

DB 存储格式（ps_stream_proxy）：
{
  "edge_uuid": "bd38d68a-...",
  "cluster_id": 31,
  "name": "qcg-test-stream",
  "listen_port": 19993,
  "load_balance": "weighted_roundrobin",
  "scheme": "tcp",
  "targets": [{"target": "127.0.0.1:19992", "weight": 100}],
  "timeout": {"connect": 60, "send": 60, "read": 60}
}
```

转换规则：
- `value.id` → `edge_uuid`
- `value.server_port` → `listen_port`
- `value.name` → `name`
- `value.upstream.type` → `load_balance`（roundrobin → weighted_roundrobin，其余不变）
- `value.upstream.nodes`（dict）→ `targets`（array）
- `value.upstream.scheme` → `scheme`
- `value.upstream.timeout` → `timeout`
- `value.upstream.keepalive_pool` → `keepalive_pool`
- `value.sni` → `sni`
- `value.remote_addr` → `remote_addr`
- `_unwrap_panshi_items()` 会先提取 `value`，后续转换直接操作 value 内的字段

### 2. 导入顺序
**选择**：四层代理在 plugin_metadata 之后、plugin_configs 之前导入
**理由**：四层代理不依赖其他资源类型，放在靠前位置，与上游/路由等解耦。具体顺序：plugin_metadata → **stream_proxy** → plugin_configs → global_rules → upstreams → routes

### 3. 冲突检测
**选择**：按 `cluster_id + listen_port` 唯一约束检测冲突
**理由**：`ps_stream_proxy` 表有 `UNIQUE(cluster_id, listen_port)`，与创建时的校验逻辑一致。

### 4. 测试连接计数
**选择**：测试连接时返回 Stream Route 数量
**理由**：与其他资源类型一致，让用户在第一步就能看到四层代理的数量。

## Risks / Trade-offs

- **[Edge 节点 stream 模块禁用]** 如果 Edge 节点的 stream 模块未启用（NOstream），`/stream/edge/admin/routes` 接口可能返回 404。**缓解**：与现有错误处理一致，捕获异常后跳过该类型，不影响其他资源导入。
