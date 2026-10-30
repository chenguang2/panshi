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

### Requirement: 时间戳转换工具

系统 SHALL 提供时间戳转换工具：单输入框输入即算（无按钮），自动识别输入形态——10 位数字按 epoch 秒、13 位数字按 epoch 毫秒、日期时间字符串按 ISO 解析（**无时区后缀按 UTC 解析**，对齐平台存储约定），非法输入显示中文错误提示。输出 SHALL 对照展示：北京时间（Asia/Shanghai）、UTC 时间、epoch 秒、epoch 毫秒、ISO 8601（UTC）。提供「当前时间」快捷填充。

#### Scenario: epoch 秒识别
- **WHEN** 用户输入 `1793331059`
- **THEN** 系统按 epoch 秒解析，展示北京时间与 UTC 时间的对照结果

#### Scenario: epoch 毫秒识别
- **WHEN** 用户输入 `1793331059000`
- **THEN** 系统按 epoch 毫秒解析，结果与该时刻一致

#### Scenario: 无时区后缀字符串按 UTC
- **WHEN** 用户输入 `2026-10-30 08:00:00`（平台后端 isoformat 形态，无时区后缀）
- **THEN** 系统按 UTC 解析，北京时间列显示 `2026-10-30 16:00:00`

#### Scenario: 带时区后缀字符串
- **WHEN** 用户输入 `2026-10-30T16:00:00+08:00`
- **THEN** 系统按其后缀时区解析（与无后缀形态区分）

#### Scenario: 非法输入
- **WHEN** 用户输入无法识别的内容（如 `hello`）
- **THEN** 显示中文提示「无法识别的时间格式」

#### Scenario: 当前时间快捷填充
- **WHEN** 用户点击「当前时间」按钮
- **THEN** 输入框填充当前 epoch 毫秒并即时展示转换结果

### Requirement: JWT 解码工具

系统 SHALL 提供 JWT 解码工具：粘贴 token 输入即算，展示格式化后的 header 与 payload（`exp` 附可读时间与过期状态：已过期 / 剩余时间），签名段仅提示不展开。工具 SHALL NOT 验证签名（纯解码，用途是查看内容）。非三段结构或 base64 解码失败 SHALL 显示中文错误提示。

#### Scenario: 解码平台 token
- **WHEN** 用户粘贴有效的平台 JWT（三段 base64url，`.` 分隔）
- **THEN** 展示格式化 header（alg 等）与 payload（sub/exp/pwd_ver 等）
- **AND** payload 中 `exp` 行附北京时间与过期状态标签

#### Scenario: exp 过期状态
- **WHEN** payload 的 `exp` 早于当前时间
- **THEN** 状态标签显示「已过期」

#### Scenario: 非法输入
- **WHEN** 用户输入少于三段或含非法 base64url 的内容
- **THEN** 显示中文提示「不是有效的 JWT（应为三段 . 分隔的 Base64URL）」

### Requirement: YAML 与 JSON 互转工具

系统 SHALL 提供 YAML 与 JSON 互转工具：左侧输入（YAML 或 JSON），中间按钮「YAML → JSON」与「JSON → YAML」，右侧只读输出。转换失败 SHALL 沿用各格式既有的中文错误文案模式。

#### Scenario: YAML 转 JSON
- **WHEN** 用户在左侧输入合法 YAML（如 `key: value`）并点击「YAML → JSON」
- **THEN** 右侧显示格式化的 JSON（2 空格缩进）

#### Scenario: JSON 转 YAML
- **WHEN** 用户在左侧输入合法 JSON 并点击「JSON → YAML」
- **THEN** 右侧显示 2 空格缩进的 YAML

#### Scenario: 转换失败
- **WHEN** 用户输入非法 YAML/JSON 并点击对应转换按钮
- **THEN** 右侧显示中文错误提示（含解析错误详情）

### Requirement: 文本 Diff 工具

系统 SHALL 提供纯文本对比工具：左右两栏分别输入文本 A 与 B，点击「对比 →」后展示差异统计摘要与逐行差异（复用 JSON 对比的差异渲染层，不做键序归一化——按原文行序比较）。

#### Scenario: 文本行差异
- **WHEN** 用户在两栏输入存在行差异的纯文本（如两段 nginx 配置）并点击「对比 →」
- **THEN** 下方展示差异统计与逐行差异渲染（红=删除，绿=新增）

#### Scenario: 完全一致
- **WHEN** 两栏文本完全相同
- **THEN** 显示「两个文本完全一致，无差异」

#### Scenario: 空输入校验
- **WHEN** 任一栏为空时点击「对比 →」
- **THEN** 显示「请输入文本 A」/「请输入文本 B」

### Requirement: IPv4/CIDR 计算器

系统 SHALL 提供 IPv4/CIDR 计算工具（仅 IPv4）：输入 `a.b.c.d` 或 `a.b.c.d/prefix`（缺省前缀按 /32）输入即算，展示 IP、前缀、子网掩码、反掩码、网络地址、广播地址、可用主机范围、可用主机数，并标注私网段（10/8、172.16/12、192.168/16、127/8）。非法 IP 或前缀 SHALL 显示中文错误提示。

#### Scenario: 网段输入
- **WHEN** 用户输入 `192.168.1.10/24`
- **THEN** 展示掩码 `255.255.255.0`、网络地址 `192.168.1.0`、广播地址 `192.168.1.255`、可用范围 `192.168.1.1 - 192.168.1.254`、可用主机数 254、私网标注

#### Scenario: 无前缀输入
- **WHEN** 用户输入 `10.0.0.5`
- **THEN** 按前缀 /32 解析：可用主机即该地址本身

#### Scenario: 非法输入
- **WHEN** 用户输入 `300.1.1.1` 或 `1.2.3.4/33`
- **THEN** 显示中文错误提示

### Requirement: 哈希计算工具

系统 SHALL 提供文本哈希计算工具：输入即算，同时展示 MD5 与 SHA-1/SHA-256/SHA-512（Web Crypto 可用时；不可用则仅 MD5 本地实现），输出统一小写十六进制。

#### Scenario: MD5 已知向量
- **WHEN** 用户输入 `abc`
- **THEN** MD5 行显示 `900150983cd24fb0d6963f7d28e17f72`

#### Scenario: SHA-256 已知向量
- **WHEN** 用户输入 `abc` 且运行环境提供 Web Crypto
- **THEN** SHA-256 行显示 `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`

#### Scenario: 空输入
- **WHEN** 输入为空
- **THEN** 各哈希行显示占位提示而非空串
