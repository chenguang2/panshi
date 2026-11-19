# Spec Delta

## ADDED Requirements

### Requirement: plugin_metadata_plugins 专用清单 key

features.yaml SHALL 支持顶层 `plugin_metadata_plugins` 键（插件名列表），专用于约束插件元数据两个添加入口的可用插件选择；`enabled_plugins`（部署级全平台启用契约）的语义 MUST NOT 被挪用承担本职责。空/未配置 SHALL 视为不限制（目录全量）。

#### Scenario: 类型校验
- **WHEN** features.yaml 中 `plugin_metadata_plugins` 不是列表
- **THEN** 系统 SHALL 显式报错退出（对齐 `enabled_plugins` / `global_rule_plugins` 校验先例，不允许静默降级）

#### Scenario: 空或未配置
- **WHEN** `plugin_metadata_plugins` 未配置或为空列表（含 features.yaml 文件不存在）
- **THEN** SHALL 视为不限制（插件元数据可用插件为目录全量）

#### Scenario: 配置暴露向后兼容
- **WHEN** 前端请求 `GET /system/features`
- **THEN** 响应 SHALL 包含 `plugin_metadata_plugins`
- **AND** 既有 `features`、`enabled_plugins` 与 `global_rule_plugins` 字段 SHALL 保持不变（只增不改）

#### Scenario: 单点 accessor
- **WHEN** 后端或前端消费该清单
- **THEN** 后端 SHALL 经单点 accessor（`app/core/features.py`）读取，MUST NOT 各自解析配置文件
- **AND** 前端 SHALL 经 features store 解析，MUST NOT 在组件内散落解析逻辑

#### Scenario: 仓库默认清单精确保留现状
- **WHEN** 使用仓库默认 `features.yaml`
- **THEN** `plugin_metadata_plugins` SHALL 为旧写死字段（`enable_metadata=true`）的全部 14 个插件名（data_center、log_process、security_common_body、security_corerule、security_common_args、security_common_cookie、security_common_referer、security_common_uri、security_common_useragent、security_restrict_ip、security_restrict_uri、security_restrict_form、security_super_ip、security_super_user）
- **AND** 仓库默认配置下「添加」入口的实际可见集合 SHALL 与改造前一致（data_center、log_process；其余 12 个 security 系被 `enabled_plugins` 平台白名单先行裁掉）

#### Scenario: 写死字段退役
- **WHEN** 本变更合入后检查插件定义目录（`GET /plugins/builtin` 响应或插件定义模块源码）
- **THEN** SHALL NOT 再存在 `enable_metadata` 字段
- **AND** 插件元数据可用插件的单一事实源 SHALL 为 features.yaml 清单，MUST NOT 出现第二套可用性开关
