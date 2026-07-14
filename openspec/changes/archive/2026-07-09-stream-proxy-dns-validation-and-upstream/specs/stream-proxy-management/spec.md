# stream-proxy-management

## MODIFIED Requirements

### Requirement: DNS 模式域名配置

#### Scenario: 目标节点字段校验
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 每个域名下的目标节点 SHALL 使用独立的 IP 和端口输入框
- **AND** IP 字段 SHALL 校验格式（IPv4）
- **AND** 端口字段 SHALL 校验范围（1-65535）

#### Scenario: 上游配置占位
- **WHEN** DNS 模式四层代理的配置详情页
- **THEN** 页面 SHALL 显示上游配置占位区域，内容固定为 `{"type": "roundrobin", "scheme": "tcp"}`
- **AND** 该区域 SHALL 为只读样式
