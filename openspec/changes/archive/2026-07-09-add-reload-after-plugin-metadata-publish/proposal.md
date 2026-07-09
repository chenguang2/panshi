## Why

插件元数据发布到 Edge 节点后，Edge 需要 reload 插件才能使新的元数据生效。当前发布流程只推送了元数据到节点（`PUT /edge/admin/plugin_metadata/{name}`），但没有调用 `PUT /edge/admin/plugins/reload`，导致插件无法感知元数据变更。

## What Changes

- `edge_sync.publish_to_nodes()` 新增可选 `post_publish_fn` / `post_log_fn` 参数，支持 publish 后执行额外操作并记录日志
- 插件元数据发布时传入 `post_publish_fn` 调用 `client.reload_plugins()`，推送元数据后触发 Edge 节点重载插件
- reload 调用通过 `post_log_fn` 记录到 Edge 日志

## Capabilities

### New Capabilities

无新增能力

### Modified Capabilities

- `plugin-metadata-management`: 「发布插件元数据」要求在推送配置到 Edge 节点后，额外调用插件 reload 接口使配置生效

## Impact

| 影响范围 | 文件 | 改动类型 |
|---|---|---|
| 共享发布服务 | `backend/app/services/edge_sync.py` | `publish_to_nodes()` 新增 `post_publish_fn`/`post_log_fn` 参数 |
| 插件元数据发布 | `backend/app/api/v1/cluster_plugin_metadata.py` | 传入 reload 回调及其日志 |
