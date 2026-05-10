## Context

上游编辑弹窗 (`ClusterList.vue` line ~336-374) 目前有4个负载均衡选项：
- 轮询 (roundrobin)
- 最少连接 (least_conn)
- IP哈希 (ip_hash)
- 加权轮询 (weighted_roundrobin)

实际业务只需要"加权轮询"和"一致性哈希"两种。同时一致性哈希需要额外参数。

## Goals / Non-Goals

**Goals:**
- 精简负载均衡选项为"加权轮询"和"一致性哈希"
- 一致性哈希时显示 hash_location 和 hash_key 字段
- hash_key 为必填

**Non-Goals:**
- 不修改后端 API 或数据模型（假设 hash_location/hash_key 字段已存在或可通过扩展字段存储）
- 不涉及其他组件或页面

## Decisions

### 1. 精简选项
移除"轮询"、"最少连接"、"IP哈希"，只保留"加权轮询"和"一致性哈希"。

### 2. 动态字段显示
使用 `v-if` 配合 `upstreamForm.load_balance === 'consistent_hash'` 来控制 hash_location 和 hash_key 的显示。

### 3. hash_location 默认值
切换到一致性哈希时，自动设置 `hash_location = 'vars'` 作为默认值。

### 4. 表单验证
使用 Ant Design Vue 的 `a-form-item` `:rules` 动态验证，当 `load_balance = 'consistent_hash'` 时，`hash_key` 必填。

## Risks / Trade-offs

| 风险 | Mitigation |
|------|------------|
| 后端不支持 hash_location/hash_key 字段 | 先做前端，后端兼容扩展字段或后续对接 |
| hash_key 验证与实际业务冲突 | 验证规则可配置化，当前为必填 |