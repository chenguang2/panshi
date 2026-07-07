## Why

四层代理配置过于复杂，普通模式只需 TCP，高级配置中仅保留健康检查和重试。DNS 模式只需 UDP，高级配置仅保留健康检查。

## What Changes

- 普通模式：协议写死 TCP，移除 TCP/UDP/TCP+UDP 选择器
- 普通模式高级配置：仅保留健康检查、重试次数、重试超时
- DNS 模式：协议写死 UDP，移除协议选择器
- DNS 模式高级配置：仅保留健康检查，默认 {"active": {}}
- 超时配置、连接池配置移除

## Impact

- 仅前端 StreamProxyFormWizard.vue
