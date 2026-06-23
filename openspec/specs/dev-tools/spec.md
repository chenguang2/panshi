# dev-tools

## Purpose

提供开发者工具箱页面，包含 Lua 函数 ↔ 配置字符串互转、URL 编解码、JSON 格式化/压缩、YAML 格式化、SM4 ECB 加解密、Base64 编解码等日常开发调试工具。

## Requirements

### Requirement: 工具箱页面入口
系统 SHALL 在顶栏导航菜单中提供「工具箱」入口，点击后跳转至 `/tools` 路由。

#### Scenario: 用户点击工具箱菜单
- **WHEN** 用户点击顶栏「工具箱」菜单项
- **THEN** 系统导航至 `/tools` 页面，展示工具箱界面

### Requirement: YAML 格式化工具
系统 SHALL 在工具箱中提供 YAML 格式化工具，将用户输入的 YAML 文本格式化为缩进规整的输出。

#### Scenario: 格式化合法 YAML
- **WHEN** 用户在左侧输入合法 YAML 文本（如 `key: value\nlist:\n  - item1\n  - item2`）并点击「格式化 ↓」
- **THEN** 右侧输出区 SHALL 显示经过 2 空格缩进格式化的 YAML，保持原始键顺序

#### Scenario: 格式化非法 YAML
- **WHEN** 用户在左侧输入非法 YAML（如语法错误或使用 Tab 缩进）并点击「格式化 ↓」
- **THEN** 右侧输出区 SHALL 显示中文错误提示，包含具体的解析错误详情，例如 `YAML 解析失败: Tabs are not allowed as indentation at line 2`

#### Scenario: 空输入
- **WHEN** 用户点击「格式化 ↓」时输入为空
- **THEN** 右侧输出区 SHALL 显示友好的中文提示「请输入 YAML 内容」

#### Scenario: 仅空白字符输入
- **WHEN** 用户点击「格式化 ↓」时输入仅为空白字符
- **THEN** 右侧输出区 SHALL 显示友好的中文提示「请输入 YAML 内容」

#### Scenario: 标量值输入
- **WHEN** 用户输入仅包含标量值的 YAML 文档（如 `42`、`null`、`hello`）
- **THEN** 右侧输出区 SHALL 正确显示格式化后的标量值

#### Scenario: 输出只读
- **WHEN** YAML 格式化面板展示时
- **THEN** 输出文本框 SHALL 设置 `readonly` 属性，与 JSON 工具行为一致

#### Scenario: 注释丢失提示
- **WHEN** YAML 格式化面板展示时
- **THEN** 工具头部或操作区附近 SHALL 显示提示，说明 YAML 注释会在格式化后被丢弃

#### Scenario: 复制粘贴
- **WHEN** 用户点击输出文本框下方的复制按钮
- **THEN** 输出内容 SHALL 复制到剪贴板并显示成功提示
- **WHEN** 用户点击输入文本框下方的粘贴按钮
- **THEN** 剪贴板文本 SHALL 粘贴到输入文本框

### Requirement: 工具箱页面布局
系统 SHALL 使用左侧图标栏 + 右侧工作区的布局结构。左侧图标栏展示 6 个工具的图标按钮（Lua 互转、URL 编解码、JSON 格式化、YAML 格式化、SM4 加解密、Base64 编解码），点击图标右侧工作区切换为对应工具。每个工具的工作区 SHALL 使用统一左右双栏布局。

#### Scenario: 图标导航切换工具
- **WHEN** 用户在左侧图标栏点击「URL 编解码」图标
- **THEN** 右侧工作区切换为 URL 编解码工具，左右双栏展示输入和输出

#### Scenario: YAML 格式化图标导航
- **WHEN** 用户在左侧图标栏点击「YAML 格式化」图标
- **THEN** 右侧工作区切换为 YAML 格式化工具，左右双栏展示输入和输出
- **AND** 左侧为输入文本框，右侧为只读输出文本框
- **AND** 两栏之间显示「格式化 ↓」按钮

#### Scenario: 左右双栏布局一致性
- **WHEN** 用户切换到任意一个工具
- **THEN** 工作区始终展示左右双栏，左边为源输入区，右边为目标输出区

### Requirement: Lua 函数转配置字符串
系统 SHALL 提供 Lua 函数代码转 `pre_functions` 插件配置字符串的功能，采用左右双栏布局。左侧输入 Lua 函数体代码，右侧显示转换后的配置字符串。点击按钮触发双向转换。

#### Scenario: 基本 Lua 函数转换
- **WHEN** 用户在左侧输入 `ngx.log(ngx.ERR, "hello")` 并点击「转为字符串」
- **THEN** 右侧显示 `"return function(conf, ctx)\nngx.log(ngx.ERR, \"hello\")\nend"` 格式的字符串

#### Scenario: 配置字符串反向解析
- **WHEN** 用户在右侧粘贴 `"return function(conf, ctx)\nngx.log(ngx.ERR, \"hello\")\nend"` 并点击「还原函数」
- **THEN** 左侧显示 `ngx.log(ngx.ERR, "hello")` 函数体代码

### Requirement: URL 编解码
系统 SHALL 提供 URL 编码和解码功能，采用左右双栏布局。左侧输入原文，右侧显示编解码结果。用户点击按钮触发转换。每个面板提供复制和粘贴按钮。

#### Scenario: URL 编码
- **WHEN** 用户在左侧输入 `https://example.com?name=张三&age=18` 并点击编码
- **THEN** 右侧显示 `https%3A%2F%2Fexample.com%3Fname%3D%E5%BC%A0%E4%B8%89%26age%3D18`

#### Scenario: URL 解码
- **WHEN** 用户在左侧输入 `https%3A%2F%2Fexample.com%3Fname%3D%E5%BC%A0%E4%B8%89%26age%3D18` 并点击解码
- **THEN** 右侧显示 `https://example.com?name=张三&age=18`

### Requirement: JSON 格式化与压缩
系统 SHALL 提供 JSON 格式化和压缩功能，采用左右双栏布局。左侧输入 JSON 字符串，操作按钮位于两栏之间，右侧只读显示处理结果。每个面板提供复制和粘贴按钮。

#### Scenario: JSON 格式化
- **WHEN** 用户在左侧输入 `{"name":"test","value":123}` 并点击格式化
- **THEN** 右侧显示带 2 空格缩进的多行美化 JSON

#### Scenario: JSON 压缩
- **WHEN** 用户在左侧输入带缩进的多行 JSON 并点击压缩
- **THEN** 右侧显示去除了空格和换行的单行 JSON

#### Scenario: JSON 格式错误处理
- **WHEN** 用户在左侧输入非法 JSON 字符串并点击格式化
- **THEN** 右侧显示错误提示，指明 JSON 解析失败

### Requirement: SM4 加解密
系统 SHALL 提供 SM4 ECB 模式加解密功能，采用左右双栏布局。密钥输入框位于顶部（默认值 `a16bc20453da220f`），左右分别为明文和密文输入框。点击按钮触发加密或解密。每个面板提供复制和粘贴按钮。

#### Scenario: SM4 加密
- **WHEN** 用户在左侧输入明文 `{"cmd":"get_config"}` 并以默认密钥点击加密
- **THEN** 右侧显示 Base64 编码的密文

#### Scenario: SM4 解密
- **WHEN** 用户在右侧输入 Base64 密文并以对应密钥点击解密
- **THEN** 左侧显示明文

#### Scenario: 自定义密钥
- **WHEN** 用户修改顶部密钥输入框的值并执行加密
- **THEN** 系统使用用户指定的密钥进行 SM4 加密

### Requirement: Base64 编解码
系统 SHALL 提供标准 Base64 编码和解码功能，采用左右双栏布局。左侧输入原文，右侧显示编解码结果。点击按钮触发转换。每个面板提供复制和粘贴按钮。

#### Scenario: Base64 编码
- **WHEN** 用户在左侧输入 `Hello World` 并点击编码
- **THEN** 右侧显示 `SGVsbG8gV29ybGQ=`

#### Scenario: Base64 解码
- **WHEN** 用户在左侧输入 `SGVsbG8gV29ybGQ=` 并点击解码
- **THEN** 右侧显示 `Hello World`

### Requirement: 工具箱功能受特性配置控制

工具箱页面 SHALL 受 `features.yaml` 中 `tools` 特性控制。

#### Scenario: 工具箱启用
- **WHEN** `features.yaml` 中 `tools` 为 `true`
- **THEN** `/tools` 路由 SHALL 注册
- **AND** 侧边栏工具箱菜单项 SHALL 显示

#### Scenario: 工具箱禁用
- **WHEN** `features.yaml` 中 `tools` 为 `false`
- **THEN** `/tools` 路由 SHALL NOT 注册
- **AND** 侧边栏工具箱菜单项 SHALL NOT 显示
- **AND** 用户无法访问工具箱页面（前端 404）
