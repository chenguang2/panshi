# upstream-advanced-config (Delta Specification)

## MODIFIED Requirements

### Requirement: 高级配置包含健康检查

高级配置 Tab SHALL 包含健康检查（checks）表单化配置，由独立 toggle 控制启用，使用结构化表单替代纯 JSON 文本域。

#### Scenario: 健康检查 toggle ON 显示表单

- **WHEN** 用户 toggle ON 健康检查
- **THEN** 健康检查区域 SHALL 显示结构化表单控件（模式选择、参数输入等）
- **AND** 表单控件 SHALL 可编辑

#### Scenario: 健康检查 toggle OFF

- **WHEN** 用户 toggle OFF 健康检查
- **THEN** 表单控件 SHALL 置灰不可编辑
- **AND** 提交时 SHALL 发送 `checks: null`

#### Scenario: 保留 JSON 编辑入口

- **WHEN** 健康检查 toggle ON
- **THEN** 表单下方 SHALL 显示"编辑原始 JSON"按钮
- **AND** 点击按钮 SHALL 弹出 JSON 编辑 modal

## REMOVED Requirements

### Requirement: 高级配置包含健康检查（原版）

**Reason**: 已由新的表单化配置界面替代

**Migration**: 健康检查不再使用 JSON 文本域，改为结构化表单。原有的 JSON 编辑能力通过"编辑原始 JSON"按钮保留。
