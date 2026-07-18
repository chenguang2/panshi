# health-check-form-ui Specification

## Purpose

提供上游健康检查的表单化配置界面，将 JSON 文本域替换为结构化表单，包括模式选择、主动/被动参数控件和 JSON 双向同步编辑器，使用户无需手写 JSON 即可完成常用配置。

## Requirements

### Requirement: 健康检查表单式配置

健康检查配置 SHALL 提供结构化表单替代纯 JSON 文本域，包含模式选择和各参数输入控件。

#### Scenario: 健康检查 toggle ON 时显示表单
- **WHEN** 用户打开高级配置 Tab 并 toggle ON 健康检查
- **THEN** 健康检查区域 SHALL 显示表单控件而非 JSON 文本域
- **AND** 所有表单控件 SHALL 可编辑

#### Scenario: 健康检查 toggle OFF 时表单置灰
- **WHEN** 用户 toggle OFF 健康检查
- **THEN** 所有表单控件 SHALL 置灰不可编辑
- **AND** 提交时 SHALL 发送 `checks: null`

---

### Requirement: 健康检查模式选择

健康检查 SHALL 提供三种预设模式：仅主动检查、仅被动检查、主动+被动检查。

#### Scenario: 模式 radio 默认值
- **WHEN** 用户新建上游并首次打开健康检查
- **THEN** 模式 radio 默认选中"仅主动检查"

#### Scenario: 切换模式
- **WHEN** 用户切换模式
- **THEN** 仅显示对应模式的参数区域
- **AND** 已填写的参数 SHALL 保留不变（非新建时）
- **AND** 提交时 SHALL 仅包含当前模式对应的 checks 结构

---

### Requirement: 主动检查参数配置

健康检查的主动检查模式 SHALL 提供以下参数输入控件。

#### Scenario: 显示主动检查参数
- **WHEN** 当前模式包含主动检查
- **THEN** 显示主动检查配置区域
- **AND** 包含以下字段：
  - 检查类型：select（http / tcp），默认 http
  - 检查路径：input，默认 `/`
  - 超时(秒)：number，默认 1
  - 间隔(秒)：number，默认 5
  - 并发数：number，默认 10
  - HTTPS 验证证书：checkbox，默认勾选

#### Scenario: 主动健康判断参数
- **WHEN** 主动检查配置展开"健康判断"
- **THEN** 显示以下字段：
  - 连续成功次数：number，默认 2
  - 健康 HTTP 状态码：标签输入，默认 [200, 302, 403, 404]

#### Scenario: 主动不健康判断参数
- **WHEN** 主动检查配置展开"不健康判断"
- **THEN** 显示以下字段：
  - 连续失败次数：number，默认 5
  - TCP 失败次数：number，默认 2
  - 超时次数：number，默认 3
  - 不健康间隔(秒)：number，默认 3
  - 不健康 HTTP 状态码：标签输入，默认 [429, 500, 501, 502, 503, 504, 505]

#### Scenario: HTTP 状态码输入验证
- **WHEN** 用户在 HTTP 状态码标签输入框中输入值
- **THEN** 系统 SHALL 校验每个状态码是否为 100-599 的整数
- **AND** 非法值 SHALL 被拒绝并提示用户
- **AND** 重复值 SHALL 自动去重
- **AND** 最终数组 SHALL 按升序排列

#### Scenario: 主动检查类型为 tcp 时隐藏 HTTP 字段
- **WHEN** 用户在主动检查中选择 type="tcp"
- **THEN** `http_path`、`HTTPS 验证证书`、`健康 HTTP 状态码`、`不健康 HTTP 状态码` SHALL 隐藏
- **AND** `超时`、`间隔`、`并发数`、`连续成功次数`、`连续失败次数`、`TCP 失败次数`、`超时次数` SHALL 保持可见

---

### Requirement: 被动检查参数配置

健康检查的被动检查模式 SHALL 提供以下参数输入控件。

#### Scenario: 显示被动检查参数
- **WHEN** 当前模式包含被动检查
- **THEN** 显示被动检查配置区域
- **AND** 包含检查类型 select（http / tcp），默认 http

#### Scenario: 被动健康判断参数
- **WHEN** 被动检查配置展开"健康判断"
- **THEN** 显示以下字段：
  - 连续成功次数：number，默认 5
  - 健康 HTTP 状态码：标签输入，默认 [200-308]（200 到 308 全系列）

#### Scenario: 被动不健康判断参数
- **WHEN** 被动检查配置展开"不健康判断"
- **THEN** 显示以下字段：
  - 连续失败次数：number，默认 5
  - TCP 失败次数：number，默认 2
  - 超时次数：number，默认 7
  - 不健康 HTTP 状态码：标签输入，默认 [429, 500, 503]

#### Scenario: 被动检查类型为 tcp 时隐藏 HTTP 状态码
- **WHEN** 用户选择被动检查 type="tcp"
- **THEN** `健康 HTTP 状态码`、`不健康 HTTP 状态码` SHALL 隐藏
- **AND** `连续成功次数`、`连续失败次数`、`TCP 失败次数`、`超时次数` SHALL 保持可见

---

### Requirement: 重置为默认值

健康检查表单 SHALL 提供"重置为默认"按钮，一键恢复为出厂默认值。

#### Scenario: 重置为默认
- **WHEN** 用户点击"重置为默认"按钮
- **THEN** 当前模式（主动/被动/主动+被动）的字段 SHALL 恢复为该模式的默认值
- **AND** 模式选择 SHALL 保持不变
- **AND** 当前已有的填写内容 SHALL 被覆盖

---

### Requirement: JSON 双向同步编辑器

健康检查 SHALL 提供"编辑原始 JSON"入口，支持表单与 JSON 之间的双向同步。

#### Scenario: 打开 JSON 编辑器
- **WHEN** 用户点击"编辑原始 JSON"按钮
- **THEN** 弹出 modal 显示当前表单状态对应的完整 JSON
- **AND** JSON 文本域 SHALL 使用等宽字体

#### Scenario: 关闭 JSON 编辑器回填表单
- **WHEN** 用户在 JSON 编辑器中修改 JSON 并关闭弹窗
- **THEN** 系统 SHALL 解析 JSON 并回填到表单所有对应字段
- **AND** 若 JSON 包含表单中没有的额外字段 SHALL 保留在内部 checks 对象中

#### Scenario: 表单更新时 JSON 同步更新
- **WHEN** 用户在表单中修改任一字段值
- **THEN** 内部 checks JSON 对象 SHALL 实时同步更新
- **AND** 下次打开 JSON 编辑器时 SHALL 显示最新值

---

### Requirement: 编辑已有上游时回填表单

打开编辑已有上游时，健康检查表单 SHALL 从 DB 的 checks JSON 解析并回填。

#### Scenario: 编辑上游时回填表单
- **WHEN** 用户打开编辑已有上游弹窗
- **THEN** 系统 SHALL 解析 `checks` JSON 字符串
- **AND** 根据 JSON 中的 active/passive 字段自动匹配模式选择
- **AND** 将各字段值回填到对应表单控件
- **AND** toggle SHALL 根据 checks 是否有值决定 ON/OFF

#### Scenario: 编辑上游时 checks 为空
- **WHEN** 编辑上游时 DB 中 checks 为 NULL 或 `{}`
- **THEN** toggle SHALL 为 OFF
- **AND** 所有表单控件 SHALL 置灰

---

### Requirement: 表单数据提交

提交时 SHALL 根据当前模式和 toggle 状态构建正确的 checks JSON。

#### Scenario: 提交时构建 checks JSON
- **WHEN** 用户提交表单且健康检查 toggle ON
- **THEN** 系统 SHALL 根据当前模式和表单字段值构建完整的 checks JSON 对象
- **AND** 仅包含当前模式对应的字段（如仅被动则不包含 active 分支）
- **AND** 值为 `null` 或 `undefined` 的字段 SHALL 不出现在最终 JSON 中
- **AND** 值为 `0`、`false`、空字符串、`[]`、`{}` 的字段 SHALL 保留在最终 JSON 中
