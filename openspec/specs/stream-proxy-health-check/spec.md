# stream-proxy-health-check Specification

## Purpose
四层代理支持健康检查配置。普通模式通过全局 JSON 编辑器设定，DNS 模式每个域名独立配置。

## Requirements

### Requirement: Health check configurable via JSON (普通模式)

普通四层代理 SHALL 支持在高级配置中通过 JSON textarea 配置健康检查，与七层上游的健康检查能力一致。

#### Scenario: Health check JSON editing
- **WHEN** user enables advanced config and edits the health check JSON textarea
- **THEN** the JSON SHALL be saved to the `checks` field of the stream proxy
- **THEN** the JSON SHALL be sent to the Edge node during publish

### Requirement: DNS 域名健康检查

DNS 模式四层代理 SHALL 每个域名独立配置健康检查，通过复选框 + JSON 编辑器组合方式配置。

#### Scenario: 默认开启健康检查
- **WHEN** 用户新建 DNS 域名
- **THEN** 该域名的健康检查复选框 SHALL 默认勾选
- **AND** JSON 编辑器 SHALL 默认填充 `{"type": "http", "active": {}, "passive": {}}`

#### Scenario: 关闭域名健康检查
- **WHEN** 用户取消勾选域名下的健康检查复选框
- **THEN** 该域名的 checks SHALL 不被包含在发布的配置中

#### Scenario: 自定义健康检查 JSON
- **WHEN** 用户勾选健康检查并在 JSON 编辑器中修改内容
- **THEN** JSON 编辑器内容 SHALL 被 parse 后写入域名 `checks` 字段
- **AND** 发布到 Edge 时 SHALL 写入 `dns_upstream.hosts.<domain>.checks`

#### Scenario: 编辑时回读已有配置
- **WHEN** 用户编辑已有的 DNS 四层代理
- **THEN** 已有域名 SHALL 根据 `cfg.checks` 是否存在决定复选框状态
- **AND** JSON 编辑器 SHALL 回显已有 checks 内容
