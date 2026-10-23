# stream-proxy-health-check Specification

## Purpose
四层代理支持健康检查配置。普通模式通过全局 JSON 编辑器设定，DNS 模式每个域名独立配置。

## Requirements

### Requirement: Health check configurable via JSON (普通模式)

普通四层代理 SHALL 支持在高级配置中通过 JSON textarea 配置健康检查，与七层上游的健康检查能力一致。「高级配置」复选框 SHALL 仅作为显隐开关：未勾选时提交载荷 SHALL NOT 包含 `checks`/`retries`/`retry_timeout` 字段（不传即不改）；勾选时三者 SHALL 一并提交。对已有非空 checks 的代理取消勾选时，系统 SHALL 弹出确认说明清除后果，确认后才在提交中清除。

#### Scenario: Health check JSON editing
- **WHEN** user enables advanced config and edits the health check JSON textarea
- **THEN** the JSON SHALL be saved to the `checks` field of the stream proxy
- **THEN** the JSON SHALL be sent to the Edge node during publish

#### Scenario: 创建未勾选高级配置不写 checks
- **WHEN** 用户新建四层代理且不勾选「高级配置」
- **THEN** 创建请求 SHALL NOT 包含 `checks`/`retries`/`retry_timeout` 字段
- **AND** 库中该代理 `checks` SHALL 为 NULL，发布到 Edge 的配置 SHALL NOT 含健康检查

#### Scenario: 编辑未勾选高级配置不改动已有 checks
- **GIVEN** 某代理已存在非空 checks（含历史默认值化石数据）
- **WHEN** 用户编辑该代理且「高级配置」保持未勾选
- **THEN** 更新请求 SHALL NOT 包含 `checks` 字段（不传即不改）
- **AND** 该代理的 checks SHALL 与编辑前逐字节一致

#### Scenario: 取消勾选清空已有 checks 需确认
- **GIVEN** 某代理已有非空 checks，编辑时「高级配置」初始为勾选
- **WHEN** 用户取消勾选「高级配置」并提交
- **THEN** 系统 SHALL 先弹出确认：「将清除该代理的健康检查配置，保存并发布后 Edge 侧健康检查将停止」
- **AND** 用户确认后提交载荷 SHALL 显式清除 checks；取消则保持勾选不变

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
