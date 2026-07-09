## Context

插件元数据发布流程 `cluster_plugin_metadata.py:publish_plugin_metadata()` 通过 `edge_sync.publish_to_nodes()` 将配置推送到各 Edge 节点，但推送后未调用 reload 接口，插件无法感知元数据变更。

Edge 节点已支持 `PUT /edge/admin/plugins/reload` 接口（`EdgeClient.reload_plugins()`），只需在 publish 成功后调用即可。

## Goals / Non-Goals

**Goals:**
- 插件元数据发布后自动调 reload，使配置立即生效
- reload 调用记录到 Edge 日志
- 其他资源类型（路由、上游、插件组等）不受影响

**Non-Goals:**
- 不修改其他资源类型的发布流程
- 不改动 EdgeClient 层

## Decisions

### 1. 扩展 `publish_to_nodes` 而非在 handler 中单独处理
- **选择**：在 `edge_sync.publish_to_nodes()` 中新增 `post_publish_fn`/`post_log_fn` 参数
- **理由**：`EdgeClient` 实例已在 `publish_to_nodes` 内部创建，无需在 handler 中重复创建；`post_log_fn` 与现有的 `log_fn` 签名一致
- **备选**：在 plugin metadata handler 中另写循环 → 重复创建 EdgeClient，耦合度更高

### 2. 不区分 reload 成功/失败对 publish 结果的影响
- **选择**：reload 失败不会改变 publish 本身的 success/fail 结果，仅在 `node_result` 中添加 `post_action` 字段
- **理由**：数据已推送成功，reload 失败属于运行时问题，不应回滚 publish
