## Why

数据对比中插件元数据为空配置 `{}` 时被误判为 "edge 中没有"；上游高级配置和路由高级匹配的开关关闭后未重置字段，再次开启仍保留旧值。

## What Changes

- **Backend**: `_compare_plugin_metadata` 中将 `if not edge_data` 改为 `if edge_data is None`，避免空 dict `{}` 被误判为 "edge 中不存在"
- **Frontend**: 上游高级配置开关关闭时，重置 checks、retries、timeout、pass_host、scheme、keepalive_pool 等字段为默认值
- **Frontend**: 路由高级匹配开关关闭时，重置 vars 为空数组
- **Testing**: 新增单元测试覆盖开关重置逻辑

## Capabilities

### New Capabilities
- `advanced-toggle-reset`: 上游高级配置和路由高级匹配的开关关闭时重置字段为默认值

### Modified Capabilities
- `config-diff`: 修复 `_compare_plugin_metadata` 中空 dict `{}` 被 `not` 真值判断误判的问题

## Impact

- `backend/app/api/v1/clusters.py`: 一行判断条件修改
- `frontend/src/views/ClusterList.vue`: 新增两个 `watch` 监听器
- `frontend/src/views/__tests__/ClusterList.advanced-toggle.spec.ts`: 新增单元测试
