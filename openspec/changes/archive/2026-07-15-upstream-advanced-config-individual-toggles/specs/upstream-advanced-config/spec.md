## REMOVED Requirements

### Requirement: 基础配置始终包含健康检查和超时默认值
**Reason**: 新设计中每个配置项独立开关，创建上游时不再无条件发送默认 checks 和 timeout。用户需要某配置项时必须显式 toggle ON。
**Migration**: 创建上游时不再自动发送默认 checks 和 timeout。如需要默认值，用户需 toggle ON 对应 section。

---

## ADDED Requirements

### Requirement: 高级配置每项独立开关

上游创建/编辑弹窗的"高级配置"Tab 中，每个配置项 SHALL 拥有独立开关（checkbox），控制该项是否启用。

#### Scenario: 每项配置独立开关
- **WHEN** 用户打开"高级配置"Tab
- **THEN** 健康检查、超时配置、连接池、重试次数、重试超时、Host 策略、通信协议 SHALL 各自拥有独立 checkbox
- **AND** checkbox OFF 时该配置项的输入控件 SHALL 置灰不可编辑
- **AND** checkbox ON 时该配置项的输入控件 SHALL 可编辑

#### Scenario: 关闭某项配置后提交
- **WHEN** 用户关闭某项配置的 checkbox 并保存
- **THEN** 该配置项对应的字段 SHALL 以 `null` 发送到后端
- **AND** 后端 SHALL 将该字段写入 `NULL`
- **AND** 发布到 Edge 时该字段 SHALL 被省略，Edge 使用默认值

#### Scenario: 编辑回填 toggle 状态
- **WHEN** 用户打开编辑已有上游弹窗
- **THEN** 每个配置项的 toggle SHALL 根据 DB 对应字段是否为 NULL 决定
- **AND** 字段值非 NULL → toggle ON + 回填该值
- **AND** 字段值为 NULL → toggle OFF

---

### Requirement: 重试次数用 radio 三态选择

重试次数 SHALL 使用 radio 三态控件：自动（使用可用节点数）、指定重试次数、禁用重试。

#### Scenario: 重试次数 radio 默认状态
- **WHEN** 用户 toggle ON 重试次数
- **THEN** radio SHALL 默认选中"自动"
- **AND** 重试次数输入框 SHALL 初始为空

#### Scenario: 选择"自动"并提交
- **WHEN** 用户选中"自动"并保存
- **THEN** 提交数据 SHALL 包含 `retries: null`
- **AND** 后端写入 `NULL`
- **AND** 发布时 SHALL 省略 retries 字段
- **AND** Edge SHALL 使用可用节点数作为重试次数

#### Scenario: 指定重试次数并提交
- **WHEN** 用户选中"指定重试次数"并输入数值 N
- **THEN** 提交数据 SHALL 包含 `retries: N`
- **AND** 后端写入 `N`
- **AND** 发布时 SHALL 包含 retries 字段

#### Scenario: 禁用重试并提交
- **WHEN** 用户选中"禁用重试"
- **THEN** 提交数据 SHALL 包含 `retries: 0`
- **AND** 后端写入 `0`
- **AND** 发布时 SHALL 包含 retries 字段
- **AND** Edge SHALL 不进行重试

#### Scenario: 编辑回填重试次数
- **WHEN** 用户打开编辑已有上游弹窗
- **THEN** DB `retries = NULL` → toggle OFF
- **AND** DB `retries = 0` → toggle ON + radio 选中"禁用"
- **AND** DB `retries > 0` → toggle ON + radio 选中"指定"+ 回填数值

---

### Requirement: 重试超时独立开关

重试超时 SHALL 作为独立配置项，与重试次数解耦。

#### Scenario: 重试超时独立 toggle
- **WHEN** 用户 toggle ON 重试超时
- **THEN** 输入框 SHALL 可编辑
- **AND** toggle OFF 时输入框 SHALL 置灰

#### Scenario: 重试超时提交
- **WHEN** 用户 toggle ON 重试超时并输入数值 N
- **THEN** 提交数据 SHALL 包含 `retry_timeout: N`
- **AND** 用户输入 0 SHALL 表示不限制
- **AND** toggle OFF 时 SHALL 发送 `retry_timeout: null`

---

## MODIFIED Requirements

### Requirement: 高级配置包含健康检查

高级配置 Tab SHALL 包含健康检查（checks）JSON 文本域，由独立 toggle 控制启用。

#### Scenario: 健康检查 toggle ON
- **WHEN** 用户 toggle ON 健康检查
- **THEN** JSON 文本域 SHALL 可编辑
- **AND** 默认显示预设 JSON `{"passive": {}, "active": {"unhealthy": {}}}`
- **AND** 文本域高度 SHALL 为 6 行

#### Scenario: 健康检查 toggle OFF
- **WHEN** 用户 toggle OFF 健康检查
- **THEN** JSON 文本域 SHALL 置灰不可编辑
- **AND** 提交时 SHALL 发送 `checks: null`

---

### Requirement: 高级配置包含超时设置

高级配置 Tab SHALL 包含超时配置（timeout），包括连接超时（connect）、发送超时（send）、读取超时（read），由独立 toggle 控制启用。

#### Scenario: 超时配置 toggle ON
- **WHEN** 用户 toggle ON 超时配置
- **THEN** 三个输入框（connect、send、read）SHALL 可编辑
- **AND** 默认值 SHALL 均为 6（秒）
- **AND** 提交时 SHALL 将 timeout 对象包含在请求中

#### Scenario: 超时配置 toggle OFF
- **WHEN** 用户 toggle OFF 超时配置
- **THEN** 三个输入框 SHALL 置灰
- **AND** 提交时 SHALL 发送 `timeout: null`

---

### Requirement: 高级配置包含 Host 策略

高级配置 Tab SHALL 包含 pass_host 和 upstream_host 配置，由独立 toggle 控制启用。

#### Scenario: Host 策略 toggle ON
- **WHEN** 用户 toggle ON Host 策略
- **THEN** pass_host 选择器 SHALL 可编辑
- **AND** pass_host 默认值为 `pass`
- **AND** pass_host 可选值为 pass、node、rewrite

#### Scenario: pass_host 为 rewrite 时显示 upstream_host
- **WHEN** 用户选择 pass_host 为 `rewrite`
- **THEN** upstream_host 输入框 SHALL 显示
- **AND** 其他 pass_host 值时 SHALL 隐藏 upstream_host

#### Scenario: Host 策略 toggle OFF
- **WHEN** 用户 toggle OFF Host 策略
- **THEN** pass_host 选择器 SHALL 置灰
- **AND** 提交时 SHALL 发送 `pass_host: null`, `upstream_host: null`

---

### Requirement: 高级配置包含通信协议

高级配置 Tab SHALL 包含 scheme 配置，由独立 toggle 控制启用。

#### Scenario: 通信协议 toggle ON
- **WHEN** 用户 toggle ON 通信协议
- **THEN** scheme 选择器 SHALL 可编辑
- **AND** 可选值为 http、https、tcp、udp
- **AND** 默认值为 http

#### Scenario: 通信协议 toggle OFF
- **WHEN** 用户 toggle OFF 通信协议
- **THEN** scheme 选择器 SHALL 置灰
- **AND** 提交时 SHALL 发送 `scheme: null`

---

### Requirement: 高级配置包含连接池

高级配置 Tab SHALL 包含连接池（keepalive_pool）配置，由独立 toggle 控制启用。

#### Scenario: 连接池 toggle ON
- **WHEN** 用户 toggle ON 连接池
- **THEN** size、idle_timeout、requests 三个输入框 SHALL 可编辑
- **AND** 提交时 SHALL 将 keepalive_pool 对象包含在请求中

#### Scenario: 连接池 toggle OFF
- **WHEN** 用户 toggle OFF 连接池
- **THEN** 三个输入框 SHALL 置灰
- **AND** 提交时 SHALL 发送 `keepalive_pool: null`
