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

### Requirement: JSON 数据对比
<!-- 2026-11-14 tools-two-way-panels：「对比 →」去箭头改「对比」——箭头语义归一为两框间转换的结果去向，对比对称读两框、结果在下方差异区，不带框方向箭头 -->


系统 SHALL 提供 JSON 对比工具：左右两栏分别输入 JSON A 与 JSON B，提供「两边格式化」按钮（两栏分别格式化）与「对比」按钮（任一栏为空时禁用）。对比结果 SHALL 展示差异统计摘要与逐行差异（红=删除/旧值，绿=新增/新值），两 JSON 一致时 SHALL 显示「完全一致」提示。

#### Scenario: 两边格式化
- **WHEN** 用户在两栏分别输入压缩 JSON 并点击「两边格式化」
- **THEN** 两栏内容 SHALL 分别变为 2 空格缩进的美化格式（键序归一化）

#### Scenario: 对比有差异
- **WHEN** 用户输入两个存在字段差异的 JSON 并点击「对比」
- **THEN** 下方 SHALL 显示差异统计（总差异数 + 新增/删除/修改分类计数）与逐行差异渲染

#### Scenario: 对比完全一致
- **WHEN** 用户输入两个语义相同的 JSON（键序不同）并点击「对比」
- **THEN** SHALL 显示「两个 JSON 完全一致，无差异」

#### Scenario: 空输入禁用对比
- **WHEN** 任一输入栏为空
- **THEN** 「对比」按钮 SHALL 处于禁用态

### Requirement: 文本 Diff 工具
<!-- 2026-11-14 tools-two-way-panels：同 JSON 对比，「对比 →」去箭头改「对比」 -->


系统 SHALL 提供纯文本对比工具：左右两栏分别输入文本 A 与 B，点击「对比」后展示差异统计摘要与逐行差异（复用 JSON 对比的差异渲染层，不做键序归一化——按原文行序比较）。

#### Scenario: 文本行差异
- **WHEN** 用户在两栏输入存在行差异的纯文本（如两段 nginx 配置）并点击「对比」
- **THEN** 下方展示差异统计与逐行差异渲染（红=删除，绿=新增）

#### Scenario: 完全一致
- **WHEN** 两栏文本完全相同
- **THEN** 显示「两个文本完全一致，无差异」

#### Scenario: 空输入校验
- **WHEN** 任一栏为空时点击「对比」
- **THEN** 显示「请输入文本 A」/「请输入文本 B」

### Requirement: YAML 格式化工具
<!-- 2026-11-14 tools-two-way-panels：「格式化 ↓」改「格式化 →」——结果落右框，箭头按「→=落右框」约定归一 -->

系统 SHALL 在工具箱中提供 YAML 格式化工具，将用户输入的 YAML 文本格式化为缩进规整的输出。

#### Scenario: 格式化合法 YAML
- **WHEN** 用户在左侧输入合法 YAML 文本（如 `key: value\nlist:\n  - item1\n  - item2`）并点击「格式化 →」
- **THEN** 右侧输出区 SHALL 显示经过 2 空格缩进格式化的 YAML，保持原始键顺序

#### Scenario: 格式化非法 YAML
- **WHEN** 用户在左侧输入非法 YAML（如语法错误或使用 Tab 缩进）并点击「格式化 →」
- **THEN** 右侧输出区 SHALL 显示中文错误提示，包含具体的解析错误详情，例如 `YAML 解析失败: Tabs are not allowed as indentation at line 2`

#### Scenario: 空输入
- **WHEN** 用户点击「格式化 →」时输入为空
- **THEN** 右侧输出区 SHALL 显示友好的中文提示「请输入 YAML 内容」

#### Scenario: 仅空白字符输入
- **WHEN** 用户点击「格式化 →」时输入仅为空白字符
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
