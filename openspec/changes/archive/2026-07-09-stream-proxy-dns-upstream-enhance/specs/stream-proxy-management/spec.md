# stream-proxy-management

## MODIFIED Requirements

### Requirement: DNS 模式域名配置

四层代理 DNS 模式 SHALL 支持每个域名独立配置 TTL 和健康检查。

#### Scenario: TTL 配置
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 每个域名行 SHALL 显示 TTL 输入框（默认 10，单位秒）
- **AND** 发布到 Edge 时 SHALL 将 `ttl_valid` 字段写入 dns_upstream hosts

#### Scenario: DNS 模式健康检查
- **WHEN** DNS 模式四层代理开启健康检查
- **THEN** 默认健康检查配置 SHALL 为 `{"type": "tcp", "active": {}, "passive": {}}`
- **AND** 发布到 Edge 时 SHALL 将 checks 写入每个域名
