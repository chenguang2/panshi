# Spec Delta

## MODIFIED Requirements

### Requirement: Lua 函数转配置字符串

<!-- 2026-11-14 tools-two-way-panels：反向按钮箭头改「← 转换为函数」（两框对等方向约定，读右写左），原「→ 转换为函数」箭头方向与行为相反 -->

系统 SHALL 提供 Lua 函数代码转 `pre_functions` 插件配置字符串的功能，采用左右双栏对等布局。左侧输入 Lua 函数体代码，右侧显示转换后的配置字符串。点击按钮触发双向转换。按钮文案 SHALL 使用方向明确的「转换为字符串 →」（读左写右）与「← 转换为函数」（读右写左）（避免「还原」一词的歧义）。

#### Scenario: 基本 Lua 函数转换
- **WHEN** 用户在左侧输入 `ngx.log(ngx.ERR, "hello")` 并点击「转换为字符串 →」
- **THEN** 右侧显示 `"return function(conf, ctx)\nngx.log(ngx.ERR, \"hello\")\nend"` 格式的字符串

#### Scenario: 配置字符串反向解析
- **WHEN** 用户在右侧粘贴 `"return function(conf, ctx)\nngx.log(ngx.ERR, \"hello\")\nend"` 并点击「← 转换为函数」
- **THEN** 左侧显示 `ngx.log(ngx.ERR, "hello")` 函数体代码

#### Scenario: 用途说明
- **WHEN** Lua 工具面板展示时
- **THEN** 工具头部 SHALL 显示一行用途说明（用于插件 pre_functions 配置与 Lua 函数体的双向转换）

### Requirement: URL 编解码
系统 SHALL 提供 URL 编码和解码功能，采用左右双栏对等布局：左框为原文、右框为编码串，两框均可输入，转换发生在两框之间。按钮文案 SHALL 标示方向：「编码 →」读左框写右框、「← 解码」读右框写左框。每个面板提供复制和粘贴按钮。

#### Scenario: URL 编码
- **WHEN** 用户在左框输入 `https://example.com?name=张三&age=18` 并点击「编码 →」
- **THEN** 右框显示 `https%3A%2F%2Fexample.com%3Fname%3D%E5%BC%A0%E4%B8%89%26age%3D18`

#### Scenario: URL 解码

<!-- 2026-11-14 tools-two-way-panels：行为反转为右框发起（两框对等），保留原标题 -->

- **WHEN** 用户在右框粘贴 `https%3A%2F%2Fexample.com%3Fname%3D%E5%BC%A0%E4%B8%89%26age%3D18` 并点击「← 解码」
- **THEN** 左框显示 `https://example.com?name=张三&age=18`

### Requirement: Base64 编解码
系统 SHALL 提供标准 Base64 编码和解码功能（UTF-8 安全），采用左右双栏对等布局：左框为原文、右框为编码串，两框均可输入。按钮文案 SHALL 标示方向：「编码 →」读左框写右框、「← 解码」读右框写左框。每个面板提供复制和粘贴按钮。

#### Scenario: Base64 编码
- **WHEN** 用户在左框输入 `Hello World` 并点击「编码 →」
- **THEN** 右框显示 `SGVsbG8gV29ybGQ=`

#### Scenario: Base64 解码

<!-- 2026-11-14 tools-two-way-panels：行为反转为右框发起（两框对等），保留原标题 -->

- **WHEN** 用户在右框粘贴 `SGVsbG8gV29ybGQ=` 并点击「← 解码」
- **THEN** 左框显示 `Hello World`

### Requirement: YAML 与 JSON 互转工具

系统 SHALL 提供 YAML 与 JSON 互转工具，采用左右双栏对等布局：左框为 YAML、右框为 JSON，两框均可输入。中间按钮文案 SHALL 标示方向：「转 JSON →」读左框写右框、「← 转 YAML」读右框写左框。转换失败 SHALL 沿用各格式既有的中文错误文案模式。

#### Scenario: YAML 转 JSON
- **WHEN** 用户在左框输入合法 YAML（如 `key: value`）并点击「转 JSON →」
- **THEN** 右框显示格式化的 JSON（2 空格缩进）

#### Scenario: JSON 转 YAML
- **WHEN** 用户在右框输入合法 JSON 并点击「← 转 YAML」
- **THEN** 左框显示 2 空格缩进的 YAML

#### Scenario: 转换失败
- **WHEN** 用户输入非法 YAML/JSON 并点击对应转换按钮
- **THEN** 结果框显示中文错误提示（含解析错误详情）
