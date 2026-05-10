## Why

当前上游负载均衡有4个选项（轮询、最少连接、IP哈希、加权轮询），但实际业务场景中只需要"加权轮询"和"一致性哈希"两种。同时，一致性哈希需要配置 `hash_location`（哈希位置：header/cookie/vars）和 `hash_key`（哈希 key，必须输入）两个参数。

## What Changes

1. **精简负载均衡选项**：上游编辑弹窗中，负载均衡下拉框只保留"加权轮询"和"一致性哈希"两个选项
2. **一致性哈希配置**：当选中"一致性哈希"时，显示额外的两个字段：
   - `hash_location`：下拉框，可选值 `header`、`cookie`、`vars`
   - `hash_key`：输入框，必填字段
3. **表单验证**：当负载均衡为"一致性哈希"时，`hash_key` 为必填项

## Capabilities

### New Capabilities
- `upstream-consistent-hash`: 一致性哈希负载均衡策略，包含哈希位置和哈希 key 配置

### Modified Capabilities
- (无现有 spec 需要修改)

## Impact

- **文件**: `frontend/src/views/ClusterList.vue`（上游编辑弹窗的负载均衡选择器和表单）
- **API**: 后端可能需要支持 `hash_location` 和 `hash_key` 字段存储
- **依赖**: Ant Design Vue `a-select`, `a-input`, 表单验证