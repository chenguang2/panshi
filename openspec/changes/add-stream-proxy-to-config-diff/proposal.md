## Why

当前节点配置对比功能（`GET /clusters/{id}/nodes/{nid}/diff`）已支持上游、路由、插件组、全局规则、插件元数据 5 类资源的 DB-vs-Edge 对比，但**四层代理（Stream Proxy）未被纳入**。

用户无法通过配置对比功能验证四层代理在 Edge 节点上的实际运行配置与数据库期望配置是否一致，导致：
- 四层代理配置变更后无法确认是否已正确推送到 Edge 节点
- 无法检测 Edge 节点上是否存在未被数据库记录的四层代理配置（或反之）
- 运维人员需要手动登录 Edge 节点查看配置，增加操作成本和出错风险

## What Changes

1. **后端**：`diff_cluster_config` API 增加四层代理对比逻辑（`_compare_stream_proxy` 函数）
2. **后端**：从 Edge 节点拉取 stream_routes 数据（复用 EdgeClient.list_stream_routes()）
3. **后端**：在对比结果分组中增加"四层代理"分组（`stream_proxies`）
4. **前端**：ConfigDiff.vue 增加 `stream_proxies` 的字段标签映射

## Impact

- **Backend**: `cluster_nodes.py` — `diff_cluster_config()` 增大约 50 行
- **Frontend**: `ConfigDiff.vue` — `fieldLabel` 映射表增大约 10 行
- **EdgeClient**: 无需改动（`list_stream_routes()` 已存在）
