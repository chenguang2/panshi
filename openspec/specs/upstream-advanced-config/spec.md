## Purpose

上游创建/编辑弹窗的高级配置功能，将健康检查、重试、超时、host策略、协议、连接池等配置项从隐藏默认值变为 Tab 中可编辑的配置项。

## Requirements

### Requirement: 上游表单高级配置 Tab
上游创建/编辑弹窗 SHALL 包含"基础配置"和"高级配置"两个 Tab，使用 `a-tabs` 组件。高级配置默认关闭，需通过开关启用。

#### Scenario: 打开添加上游弹窗
- **WHEN** 用户点击"添加上游"
- **THEN** 弹窗 SHALL 显示"基础配置" Tab 处于激活状态
- **AND** 基础配置底部 SHALL 有"高级配置"开关（默认关闭）
- **AND** "高级配置" Tab 显示"高级配置未启用"提示

#### Scenario: 启用高级配置
- **WHEN** 用户开启"高级配置"开关
- **THEN** "高级配置" Tab 内容 SHALL 变为可编辑的表单
- **AND** 高级配置中的健康检查配置 SHALL 使用预设默认值

### Requirement: 高级配置包含健康检查
高级配置 Tab SHALL 包含可编辑的健康检查（checks）JSON 文本域。

#### Scenario: 查看健康检查默认值
- **WHEN** 用户进入高级配置 Tab
- **THEN** 健康检查区域 SHALL 显示 checks JSON
- **AND** 默认值 SHALL 为 `{"passive": {}, "active": {"unhealthy": {}}}`

#### Scenario: 编辑健康检查
- **WHEN** 用户修改 checks JSON 内容
- **THEN** 提交时 SHALL 使用用户修改后的值

### Requirement: 基础配置始终包含健康检查和超时默认值
无论高级配置是否开启，创建上游时 SHALL 始终包含默认的 checks 和 timeout 配置。

#### Scenario: 关闭高级配置时创建上游
- **WHEN** 用户未开启高级配置直接创建上游
- **THEN** 提交数据 SHALL 包含默认 checks: `{"passive": {}, "active": {"unhealthy": {}}}`
- **AND** 提交数据 SHALL 包含默认 timeout: `{"connect": 6, "send": 6, "read": 6}`

### Requirement: 高级配置包含重试设置
高级配置 Tab SHALL 包含重试次数（retries）和重试超时（retry_timeout）配置。

#### Scenario: 重试次数默认值
- **WHEN** 用户启用高级配置
- **THEN** retries 默认值为后端可用 node 数量
- **AND** 0 代表不启用重试机制

#### Scenario: 重试超时默认值
- **WHEN** 用户启用高级配置
- **THEN** retry_timeout 默认值为 0（不限制重试时间）

### Requirement: 高级配置包含超时设置
高级配置 Tab SHALL 包含超时配置（timeout），包括连接超时（connect）、发送超时（send）、读取超时（read），单位为秒。

#### Scenario: 设置超时配置
- **WHEN** 用户设置 timeout.connect、timeout.send、timeout.read
- **THEN** 提交时 SHALL 将 timeout 对象包含在请求中

### Requirement: 高级配置包含 host 策略
高级配置 Tab SHALL 包含 pass_host 和 upstream_host 配置。

#### Scenario: pass_host 默认值
- **WHEN** 用户启用高级配置
- **THEN** pass_host 默认值为 `pass`
- **AND** pass_host 可选值为 pass、node、rewrite

#### Scenario: pass_host 为 rewrite 时显示 upstream_host
- **WHEN** 用户选择 pass_host 为 `rewrite`
- **THEN** upstream_host 输入框 SHALL 显示
- **AND** 其他 pass_host 值时 SHALL 隐藏 upstream_host

### Requirement: 高级配置包含通信协议
高级配置 Tab SHALL 包含 scheme 配置，可选值为 http、https、tcp、udp，默认值为 http。

#### Scenario: scheme 默认值
- **WHEN** 用户启用高级配置
- **THEN** scheme 默认值为 `http`

### Requirement: 高级配置包含连接池
高级配置 Tab SHALL 包含连接池（keepalive_pool）配置，包括 size、idle_timeout、requests 三个参数。

#### Scenario: 连接池配置
- **WHEN** 用户设置 keepalive_pool 参数
- **THEN** 提交时 SHALL 将 keepalive_pool 对象包含在请求中
