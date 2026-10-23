# stream-proxy-ux-review-fixes 变更规格

## MODIFIED Requirements

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
