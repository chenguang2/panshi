# Route Plugins Config

## Delta

## ADDED Requirements

### Requirement: 插件配置保存 SHALL 使用单层 JSON 编码

路由插件配置在保存时（无论表单模式还是 JSON 编辑模式）SHALL 以单层 JSON 编码字符串存储。JSON 编辑模式下编辑器发出的原始文本 SHALL NOT 被二次序列化。

#### Scenario: JSON 编辑模式保存路由插件
- **WHEN** 用户为路由插件（如 proxy_rewrite）在 JSON 编辑模式下输入配置并保存
- **THEN** 存储的 config SHALL 是单层 JSON 字符串
- **AND** 对该字符串执行一次 `JSON.parse` SHALL 得到对象
- **AND** 发布时该插件配置 SHALL 被 Edge API 接受（返回非 400）

#### Scenario: 表单编辑模式保存路由插件
- **WHEN** 用户为路由插件在表单编辑模式下填写字段并保存
- **THEN** 存储的 config SHALL 保持单层 JSON 编码（行为不因 JSON 模式修复而回归）

#### Scenario: 插件组/全局规则提交路径兼容
- **WHEN** 用户在插件组或全局规则编辑器中经 JSON 模式保存插件配置
- **THEN** 提交路径的 `JSON.parse`（`useClusterPluginEntity.ts` / `PluginEntityFormModal.vue`）SHALL 将单层 JSON 字符串解析为对象
- **AND** 存储于 `ps_plugin_config.plugins` / `ps_global_rule.plugins` 的插件值 SHALL 是对象而非字符串
- **AND** 发布时 SHALL 被 Edge API 接受（返回非 400）
