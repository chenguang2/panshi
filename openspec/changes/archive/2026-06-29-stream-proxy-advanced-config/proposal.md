## Why

四层代理（stream proxy）的配置项过于简陋，缺少一致性哈希的 hash key 显示、重试配置和健康检查，与七层上游管理的配置能力不对齐。用户需要这些配置来实现生产级流量管理。

## What Changes

- 四层代理选择"一致性哈希"负载均衡时，显示 hash key 信息（写死为 `remote_addr`）
- 高级配置中增加：重试次数、重试超时
- 移除 Remote Addr 和 SNI 两个选项
- 高级配置中增加健康检查（JSON 编辑，同七层上游）
- 后端 StreamProxy 模型增加 `hash_on`、`key`、`checks`、`retries`、`retry_timeout` 字段
- 发布 API 中将新字段传递给 Edge 节点

## Capabilities

### New Capabilities
- `stream-proxy-health-check`: 四层代理的健康检查配置能力

### Modified Capabilities
- `stream-proxy-management`: 负载均衡、高级配置项扩展；移除 remote_addr 和 sni

## Impact

- 后端：StreamProxy 模型 + 5 个新字段，DB migration，Pydantic schema 扩展，publish API 增强
- 前端：StreamProxyFormWizard.vue 表单重写
