# deployment-feature-config Delta

## ADDED Requirements

### Requirement: global_rule_plugins 专用清单 key

features.yaml SHALL 支持顶层 `global_rule_plugins` 键（插件名列表），专用于约束全局规则两入口的可用插件选择；`enabled_plugins`（部署级全平台启用契约）的语义 MUST NOT 被挪用承担本职责。

#### Scenario: 类型校验
- **WHEN** features.yaml 中 `global_rule_plugins` 不是列表
- **THEN** 系统 SHALL 显式报错退出（对齐 `enabled_plugins` 校验先例，不允许静默降级）

#### Scenario: 空或未配置
- **WHEN** `global_rule_plugins` 未配置或为空列表（含 features.yaml 文件不存在）
- **THEN** SHALL 视为不限制（全局规则可用插件为目录全量）

#### Scenario: 配置暴露向后兼容
- **WHEN** 前端请求 `GET /system/features`
- **THEN** 响应 SHALL 包含 `global_rule_plugins`
- **AND** 既有 `features` 与 `enabled_plugins` 字段 SHALL 保持不变（只增不改）

#### Scenario: 单点 accessor
- **WHEN** 后端或前端消费该清单
- **THEN** 后端 SHALL 经单点 accessor（`app/core/features.py`）读取，MUST NOT 各自解析配置文件
- **AND** 前端 SHALL 经 features store 解析，MUST NOT 在组件内散落解析逻辑
