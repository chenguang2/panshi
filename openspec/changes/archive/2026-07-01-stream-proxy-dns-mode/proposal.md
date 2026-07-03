## Why

四层代理需要支持 DNS 服务器模式，使用 `dns_upstream` 插件提供智能 DNS 域名解析及动态负载调度。DNS 模式的配置逻辑与普通四层代理完全不同（域名映射表 + 客户端 CIDR 匹配），需要在步骤 1 就区分模式，步骤 2 根据模式展示不同的表单。

## What Changes

- 步骤 1 端口选择区域增加「代理类型」选项（普通四层代理 / DNS 服务器）
- 选择「DNS 服务器」后步骤 2 展示全新的 DNS 配置表单
- 选择「普通四层代理」后步骤 2 保持现有逻辑不变
- DNS 配置包含：域名映射表、目标节点 + 客户端 CIDR、负载均衡算法、高级配置（超时/连接池/健康检查）
- 发布时 DNS 模式的代理携带 `dns_upstream` 插件配置

## Capabilities

### New Capabilities
- `stream-proxy-dns-mode`: 四层代理支持 DNS 服务器模式，配置 `dns_upstream` 插件

### Modified Capabilities
- `stream-proxy-management`: 步骤 1 增加代理类型选择，步骤 2 根据模式切换表单
- `stream-proxy-health-check`: DNS 模式的高级配置也包含健康检查

## Impact

- 前端：StreamProxyFormWizard.vue 大幅改造，步骤 1 增加代理类型，步骤 2 DNS 模式新表单
- 后端：StreamProxy 发布 API 改造，DNS 模式携带 dns_upstream 插件配置到 Edge
- 类型：StreamProxy 类型增加 `proxy_type` 字段
