# Plugin Config JSON Serialization

## Purpose

定义插件配置在 JSON 编辑模式下的序列化行为：任何模式下保存的插件 config 都必须是单层 JSON 编码字符串，可被 Edge 发布流程正确解析为对象。

## ADDED Requirements

### Requirement: JSON 编辑模式保存插件配置 SHALL 产生单层 JSON 编码

当用户在 JSON 编辑模式下保存插件配置时，系统 SHALL 将配置保存为单层 JSON 编码字符串。编辑器发出的原始文本字符串 SHALL NOT 被再次序列化。

#### Scenario: JSON 编辑模式保存对象配置
- **WHEN** 用户在 JSON 编辑模式输入合法 JSON 对象配置（如 `{"headers": {"Host": "example.com"}}`）并保存
- **THEN** 保存的 config 值 SHALL 是单层 JSON 字符串
- **AND** 对该字符串执行一次 `JSON.parse` 后 SHALL 得到对象而非字符串

#### Scenario: JSON 编辑模式切换到表单模式的既有配置保持正确
- **WHEN** 已保存的单层 JSON 配置在 JSON 编辑模式下打开并保存（未修改）
- **THEN** config 值 SHALL 保持单层 JSON 编码，不发生二次编码

### Requirement: 编辑同步 SHALL 不发生反馈环

`jsonEditorValue` 与 `jsonConfig` 的双向同步 SHALL 在 text 模式下收敛——用户输入的字符串 SHALL NOT 被回写为对象导致编辑器内容重置或光标跳变。

#### Scenario: text 模式输入合法 JSON 不重置编辑器
- **WHEN** 用户在 text 模式输入合法 JSON 字符串
- **THEN** `jsonConfig` SHALL 保持该字符串（单层编码）
- **AND** `jsonEditorValue` SHALL 保持字符串类型（不被 `watch(jsonConfig)` 回写为对象）
- **AND** 编辑器内容与光标位置 SHALL NOT 因同步被重置

#### Scenario: 打开既有双重编码数据可自动归一
- **WHEN** 打开数据库中双重编码的 config（`JSON.parse` 一次后仍是字符串）
- **THEN** 同步后 `jsonConfig` SHALL 归一为单层 JSON
- **AND** 直接保存后 DB 中 SHALL 存储单层 JSON 编码

### Requirement: 表单编辑模式保存插件配置 SHALL 产生单层 JSON 编码

当用户在表单编辑模式下保存插件配置时，系统 SHALL 将配置序列化为单层 JSON 编码字符串。

#### Scenario: 表单模式保存配置
- **WHEN** 用户在表单模式填写字段并保存
- **THEN** 保存的 config 值 SHALL 是单层 JSON 字符串
- **AND** 该行为 SHALL NOT 受 JSON 编辑模式修复影响（无行为回归）

### Requirement: 发布时插件配置 SHALL 被 Edge 接受为对象

发布路由到 Edge 节点时，插件配置 SHALL 以对象形式出现在 payload 的 `plugins.<plugin_name>` 中。

#### Scenario: 双重编码配置导致发布失败
- **WHEN** 数据库中插件 config 是双重编码字符串（`JSON.parse` 一次后仍是字符串）
- **THEN** 系统 SHALL NOT 将该字符串直接发送给 Edge
- **AND** 修复后通过重新保存可生成可发布的正确配置

#### Scenario: 正常配置发布成功
- **WHEN** 数据库中插件 config 是单层 JSON 字符串（`JSON.parse` 一次得到对象）
- **THEN** 发布时 `plugins.<plugin_name>` SHALL 是对象
- **AND** Edge API SHALL 返回成功而非 400 `wrong type: expected object, got string`
