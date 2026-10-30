# dev-tools Delta

## MODIFIED Requirements

### Requirement: 工具箱页面布局

系统 SHALL 使用左侧导航栏 + 右侧工作区的布局结构。左侧导航栏展示 7 个工具的「图标 + 文字标签」按钮（Lua 互转、URL 编解码、JSON 格式化、SM4 加解密、Base64 编解码、YAML 格式化、JSON 对比），当前工具项 SHALL 高亮。点击导航项右侧工作区切换为对应工具。每个工具的工作区 SHALL 使用统一左右双栏布局。

<!-- 2026-10-30 tools-ux-review-fixes：原 spec 写「6 个工具」但代码实际 7 个（含 JSON 对比），本条修正漂移并按用户裁决 A（图标+文字）提升辨识度；场景标题保持稳定标识符 -->

#### Scenario: 图标导航切换工具
- **WHEN** 用户在左侧导航栏点击「URL 编解码」项
- **THEN** 右侧工作区切换为 URL 编解码工具，左右双栏展示输入和输出
- **AND** 该导航项显示高亮态

#### Scenario: YAML 格式化图标导航
- **WHEN** 用户在左侧导航栏点击「YAML 格式化」项
- **THEN** 右侧工作区切换为 YAML 格式化工具，左右双栏展示输入和输出
- **AND** 左侧为输入文本框，右侧为只读输出文本框
- **AND** 两栏之间显示「格式化 ↓」按钮

#### Scenario: 左右双栏布局一致性
- **WHEN** 用户切换到任意一个工具
- **THEN** 工作区始终展示左右双栏，左边为源输入区，右边为目标输出区

#### Scenario: 导航项文字标签
- **WHEN** 用户查看左侧导航栏（无需悬停）
- **THEN** 每个导航项 SHALL 同时显示图标与工具名称文字，无需依赖 tooltip 即可辨识工具

### Requirement: Lua 函数转配置字符串

系统 SHALL 提供 Lua 函数代码转 `pre_functions` 插件配置字符串的功能，采用左右双栏布局。左侧输入 Lua 函数体代码，右侧显示转换后的配置字符串。点击按钮触发双向转换。按钮文案 SHALL 使用方向明确的「转换为字符串 →」与「→ 转换为函数」（避免「还原」一词的歧义）。

#### Scenario: 基本 Lua 函数转换
- **WHEN** 用户在左侧输入 `ngx.log(ngx.ERR, "hello")` 并点击「转换为字符串 →」
- **THEN** 右侧显示 `"return function(conf, ctx)\nngx.log(ngx.ERR, \"hello\")\nend"` 格式的字符串

#### Scenario: 配置字符串反向解析
- **WHEN** 用户在右侧粘贴 `"return function(conf, ctx)\nngx.log(ngx.ERR, \"hello\")\nend"` 并点击「→ 转换为函数」
- **THEN** 左侧显示 `ngx.log(ngx.ERR, "hello")` 函数体代码

#### Scenario: 用途说明
- **WHEN** Lua 工具面板展示时
- **THEN** 工具头部 SHALL 显示一行用途说明（用于插件 pre_functions 配置与 Lua 函数体的双向转换）

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
- **THEN** 右侧显示错误提示，包含「JSON 解析失败」中文说明、原始错误详情（含出错位置）
- **AND** 附中文修复指引（检查引号/逗号/括号是否配对）

### Requirement: SM4 加解密

系统 SHALL 提供 SM4 ECB 模式加解密功能，采用左右双栏布局。密钥输入框位于顶部（默认值 `a16bc20453da220f`，即 Edge 通道默认 SM4 密钥，用于调试平台↔Edge 加密链路），左右分别为明文和密文输入框。点击按钮触发加密或解密。每个面板提供复制和粘贴按钮。

#### Scenario: SM4 加密
- **WHEN** 用户在左侧输入明文 `{"cmd":"get_config"}` 并以默认密钥点击加密
- **THEN** 右侧显示 Base64 编码的密文

#### Scenario: SM4 解密
- **WHEN** 用户在右侧输入 Base64 密文并以对应密钥点击解密
- **THEN** 左侧显示明文

#### Scenario: 自定义密钥
- **WHEN** 用户修改顶部密钥输入框的值并执行加密
- **THEN** 系统使用用户指定的密钥进行 SM4 加密

#### Scenario: 短密钥警告
- **WHEN** 用户输入的密钥字节数不足或超过 16 字节并执行加解密
- **THEN** 功能正常执行（密钥自动补齐/截断，往返一致）
- **AND** 结果区顶部 SHALL 显示黄条警告「密钥非 16 字节，已自动补齐/截断——与 Edge 通道真实加解密行为可能不一致」

#### Scenario: 恢复默认密钥
- **WHEN** 用户点击「恢复默认」按钮
- **THEN** 密钥输入框恢复为 Edge 通道默认 SM4 密钥
- **AND** 按钮带 tooltip 说明该默认值的用途（调试平台↔Edge 加密链路）

## ADDED Requirements

### Requirement: 剪贴板兼容性与回退

工具箱所有复制/粘贴功能 SHALL 在非 HTTPS 环境（内网 `http://<ip>:<port>` 部署形态）下可用：`navigator.clipboard` API 不可用时，复制 SHALL 回退到隐藏 textarea + `document.execCommand('copy')`；粘贴 SHALL 聚焦目标输入框并提示用户 Ctrl+V（浏览器不提供反向兼容的粘贴 API）。

#### Scenario: http 环境复制
- **WHEN** 页面运行在 http 协议下（`navigator.clipboard` 不可用）且用户点击任意复制按钮且内容非空
- **THEN** 内容 SHALL 经 execCommand 回退复制成功并提示「已复制」
- **AND** 不出现「复制失败」

#### Scenario: http 环境粘贴
- **WHEN** 页面运行在 http 协议下且用户点击任意粘贴按钮
- **THEN** 系统 SHALL 聚焦对应输入框并提示「请在输入框中按 Ctrl+V 粘贴」（浏览器不提供粘贴兼容 API，明示替代动作而非仅报失败）

#### Scenario: 复制空内容
- **WHEN** 用户在内容为空的输入框旁点击复制按钮
- **THEN** 提示「没有可复制的内容」，不执行复制

### Requirement: 面板复制按钮语义

每个面板的复制按钮语义 SHALL 与其所在面板一致：输入框旁的复制按钮复制输入内容，输出框旁的复制按钮复制输出内容。任意面板的复制按钮 SHALL NOT 复制另一个面板的内容。

#### Scenario: 输入框复制复制输入
- **WHEN** 用户在 YAML 工具左侧输入 `key: value` 并点击左侧（输入框旁）的复制按钮
- **THEN** 复制到剪贴板的内容 SHALL 为输入内容 `key: value`

#### Scenario: 输出框复制复制输出
- **WHEN** 用户执行转换后点击右侧（输出框旁）的复制按钮
- **THEN** 复制到剪贴板的内容 SHALL 为右侧输出内容

### Requirement: 工具深链

工具箱 SHALL 将当前工具同步到 URL query 参数 `tool`：切换工具时更新（不触发页面刷新），进入页面时从 query 恢复；query 值非法或缺失时回退默认工具（Lua 互转）。

#### Scenario: 切换工具更新 URL
- **WHEN** 用户从默认工具切换到「JSON 格式化」
- **THEN** URL SHALL 变为 `/tools?tool=json`（不刷新页面）

#### Scenario: 刷新保持当前工具
- **WHEN** 用户在 `?tool=sm4` 状态下刷新页面
- **THEN** 页面加载后 SHALL 直接展示 SM4 工具面板

#### Scenario: 非法 query 回退
- **WHEN** 用户访问 `/tools?tool=unknown`
- **THEN** 页面 SHALL 回退展示默认工具（Lua 互转），URL 归位为 `/tools`

### Requirement: JSON 数据对比

系统 SHALL 提供 JSON 对比工具：左右两栏分别输入 JSON A 与 JSON B，提供「两边格式化」按钮（两栏分别格式化）与「对比 →」按钮（任一栏为空时禁用）。对比结果 SHALL 展示差异统计摘要与逐行差异（红=删除/旧值，绿=新增/新值），两 JSON 一致时 SHALL 显示「完全一致」提示。

#### Scenario: 两边格式化
- **WHEN** 用户在两栏分别输入压缩 JSON 并点击「两边格式化」
- **THEN** 两栏内容 SHALL 分别变为 2 空格缩进的美化格式（键序归一化）

#### Scenario: 对比有差异
- **WHEN** 用户输入两个存在字段差异的 JSON 并点击「对比 →」
- **THEN** 下方 SHALL 显示差异统计（总差异数 + 新增/删除/修改分类计数）与逐行差异渲染

#### Scenario: 对比完全一致
- **WHEN** 用户输入两个语义相同的 JSON（键序不同）并点击「对比 →」
- **THEN** SHALL 显示「两个 JSON 完全一致，无差异」

#### Scenario: 空输入禁用对比
- **WHEN** 任一输入栏为空
- **THEN** 「对比 →」按钮 SHALL 处于禁用态
