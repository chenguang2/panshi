## Why

当前集群管理中的发布操作会推送到集群内所有在线 Edge 节点，无法选择特定节点发布。用户需要一种方式控制发布范围，例如灰度发布到部分节点验证后再全量发布。此外，插件元数据管理组件名为 `GlobalPluginSelector`，实际职责为完整的元数据管理面板，命名有歧义。

## What Changes

1. **发布确认弹窗增加节点选择** — 将 6 个发布入口的确认弹窗改为带 IP 选择列表的通用组件，默认全不选，支持全选/取消全选
2. **后端 publish 端点增加 `node_ids` 参数** — 所有 6 个 publish 端点接收可选 `node_ids` 列表，传递时只发布到指定节点，不传时向后兼容（发布到所有在线节点）
3. **重命名 `GlobalPluginSelector` → `PluginMetadata`** — 组件文件、CSS class、引用处同步更新

## Capabilities

### New Capabilities
- `publish-node-select`: 发布时选择目标节点的通用能力

### Modified Capabilities
- `cluster-management`: 发布流程变更（节点选择）

## Impact

| 层 | 影响 |
|---|---|
| 前端组件 | 新建 `PublishConfirmModal.vue`；`GlobalPluginSelector.vue` 重命名为 `PluginMetadata.vue` |
| 前端视图 | `ClusterList.vue` 5 处发布方法、1 处 import 变更 |
| 后端 API | `clusters.py` 5 个 publish 端点 + `plugin_metadata.py` 1 个 publish 端点，增加请求体 |
| 后端 Schema | 新增 `PublishRequest` schema |
| 文档 | `docs/edge/*.log` 中的 API 示例更新 |
