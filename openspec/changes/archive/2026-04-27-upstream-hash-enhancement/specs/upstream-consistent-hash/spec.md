## Summary

上游编辑弹窗中，负载均衡下拉框简化为两个选项：加权轮询、一致性哈希。当选择"一致性哈希"时，显示 `hash_location`（哈希位置）和 `hash_key`（哈希 key）两个额外字段。

## User Interactions & Flows

1. 用户点击"添加上游"或编辑已有上游，打开上游编辑弹窗
2. 负载均衡下拉框默认显示"加权轮询"
3. 用户切换为"一致性哈希"时，表单动态显示 `hash_location` 下拉框和 `hash_key` 输入框
4. 当 `hash_key` 为空时，点击确定会触发表单验证错误
5. 用户填写完整的哈希配置后，保存上游

## UI/UX Specification

### 负载均衡下拉框
- 选项 1：`加权轮询`
- 选项 2：`一致性哈希`
- 默认值：`加权轮询`

### 条件显示字段（当 load_balance = "consistent_hash" 时）

**hash_location 下拉框**：
- 位置：在负载均衡选择下方，动态显示
- 标签："哈希位置"
- 选项：
  - `header`：使用 Header 中的值进行哈希
  - `cookie`：使用 Cookie 中的值进行哈希
  - `vars`：使用请求变量进行哈希
- 默认值：`vars`

**hash_key 输入框**：
- 位置：在 hash_location 下方
- 标签："Key"
- 提示："请输入哈希 key"
- 验证：必填，不能为空
- 最大长度：256 字符

### 表单验证
- 当 `load_balance = 'consistent_hash'` 时，`hash_key` 为必填字段
- 验证失败时在输入框下方显示红色错误提示

## Technical Approach

1. `upstreamForm` 增加 `hash_location` 和 `hash_key` 字段
2. 使用 `v-if` 或动态渲染实现条件显示
3. 通过 `watch` 监听 `upstreamForm.load_balance` 变化，动态设置 `hash_location` 默认值
4. 表单验证规则根据 `load_balance` 动态切换

## Files to Modify

- `frontend/src/views/ClusterList.vue`
  - line ~342-347: 精简负载均衡选项为 2 项
  - line ~348-351: 添加 hash_location 和 hash_key 条件显示
  - upstreamForm 增加 `hash_location`, `hash_key` 字段

## Acceptance Criteria

- [ ] 负载均衡下拉框只有"加权轮询"和"一致性哈希"两个选项
- [ ] 选择"一致性哈希"时，动态显示 hash_location 和 hash_key 字段
- [ ] 选择"加权轮询"时，隐藏这两个字段
- [ ] hash_key 为必填，验证提示正常显示
- [ ] 切换负载均衡类型时，hash_location 自动重置为默认值