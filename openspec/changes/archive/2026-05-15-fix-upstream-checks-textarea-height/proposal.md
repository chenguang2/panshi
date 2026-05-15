## Why

上游高级配置中的健康检查（checks）JSON 编辑框 `:rows="20"` 过高，默认内容只有 5 行，大量空白导致体验不佳。

## What Changes

- 健康检查文本域 `:rows` 从 20 改为 6，刚好容纳默认 JSON 内容

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `upstream-advanced-config`: 调整健康检查文本域高度以匹配默认内容

## Impact

- `frontend/src/views/ClusterList.vue`: 一行 rows 参数修改
