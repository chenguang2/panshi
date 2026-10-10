# config-version-management Delta

## ADDED Requirements

### Requirement: 版本管理弹窗资源名词表

版本管理弹窗的资源名称 SHALL 来自常量映射，MUST NOT 使用不断加长的三元链兜底。

#### Scenario: 资源名词正确渲染
- **WHEN** 用户从任意资源类型打开版本管理弹窗
- **THEN** 标题 SHALL 显示该资源的正确中文名（`global_rule`→「全局规则」、`plugin_config`→「插件组」等）
- **AND** resourceType→中文名映射 SHALL 收敛为常量（对齐 `useClusterUtils` 既有 `resourceLabels` 范本），MUST NOT 以「插件」作未知类型兜底

#### Scenario: edge_uuid 展示统一
- **WHEN** 不同入口打开同一资源的版本管理弹窗
- **THEN** 标题是否携带 edge_uuid SHALL 两入口一致（本变更统一为不携带）
