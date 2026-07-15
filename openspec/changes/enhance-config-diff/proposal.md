## Why

节点配置对比功能存在两个不足：插件元数据对比时，服务端自动注入的 `id` 字段导致误报差异；SSL 证书尚未纳入对比范围，用户无法查看 SSL 证书在 DB 和 Edge 节点之间的配置差异。

## What Changes

1. **插件元数据对比忽略 `id` 字段**：通过 `equivalence_rules.yaml` 规则文件配置，与现有 upstream/route 的 `ignore_edge_fields` 机制一致。
2. **新增 SSL 证书配置对比**：在节点配置对比结果中增加「SSL 证书」分组，支持查看 DB 与 Edge 节点之间的 SSL 证书差异。
3. **EdgeClient 新增 `list_ssl()` 方法**：与其他资源的 `list_*` 方法保持一致。
4. **SNI 字段兼容 `sni`/`snis` 两种格式**：Edge 可能返回单字符串或数组，归一化为逗号分隔字符串后对比。

## Capabilities

### New Capabilities
_无_

### Modified Capabilities
- `config-diff`: 插件元数据对比忽略 `id` 字段；新增 SSL 证书对比

## Impact

- **后端**: `app/services/edge_client.py` — 新增 `list_ssl()` 方法
- **后端**: `app/api/v1/cluster_nodes.py` — `_compare_plugin_metadata` 改用规则文件忽略 `id`；新增 `_compare_ssl_certificate` 函数及对比分组
- **配置**: `app/config/equivalence_rules.yaml` — 新增 `plugin_metadata` 规则（`ignore_edge_fields: [id]`）
