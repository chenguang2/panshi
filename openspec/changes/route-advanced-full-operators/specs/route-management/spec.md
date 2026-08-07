# Route Management

## ADDED Requirements

### Requirement: 高级匹配运算符全集

路由高级匹配编辑器 SHALL 支持 Edge 手册 §8.1.1 定义的全部比较运算符。

#### Scenario: 运算符下拉完整展示
- **WHEN** 用户在高级匹配编辑器中选择操作符
- **THEN** 下拉 SHALL 按类别分组展示：等于（`==`/`==*`）、不等于（`!=`/`!=*`）、数值（`>`/`>=`/`<`/`<=`）、版本号（`v>`/`v>=`/`v<`/`v<=`）、正则（`~~`/`~~*`）、IP（`ip~`/`not_ip~`）、包含(列表)（`has`/`has*`/`rx~`/`rx~*`/`in*`）、组合（`IN`/`NOT IN`）
- **THEN** 所有运算符 SHALL 可被选中并参与序列化
- **THEN** 手册 `in`（右值数组存在）SHALL NOT 作为独立选项展示（与 `IN` 序列化相同，避免重复）

#### Scenario: 版本号运算符序列化
- **WHEN** 用户配置 `v>=` 运算符
- **THEN** 序列化 SHALL 生成 `[key, "v>=", value]` 且原样透传

#### Scenario: 忽略大小写运算符
- **WHEN** 用户配置 `==*`、`!=*`、`~~*`、`has*`、`in*`、`rx~*`
- **THEN** 序列化 SHALL 原样保留运算符名称（含 `*` 后缀）

#### Scenario: 忽略大小写选项文本缩短 + tooltip
- **WHEN** 用户展开运算符下拉
- **THEN** 忽略大小写变体 SHALL 显示为短形式（如「等于*」「正则*」「路径存在*」「存在*」），选项文本 SHALL 不超过 10 字
- **THEN** 悬停短选项 SHALL 显示完整中文名（tooltip，如「等于(忽略大小写)」）

#### Scenario: ipmatch 别名兼容读取
- **WHEN** 路由 vars 包含 `[key, "ipmatch", [list]]`
- **THEN** 编辑器 SHALL 将其归一化为 `ip~` 规则（value 数组）
- **THEN** 运算符下拉 SHALL NOT 展示 `ipmatch` 独立选项

### Requirement: 操作符行内提示

高级匹配编辑器 SHALL 在条件行下方显示当前操作符的使用说明。

#### Scenario: 行内动态提示
- **WHEN** 用户选择某操作符（如 `v>=`）
- **THEN** 条件行下方 SHALL 显示该操作符的说明文案（语义 + 示例，如「版本号比较：http_appv v>= 1.2.3」）
- **THEN** 切换操作符时 SHALL 实时更新说明文案

### Requirement: JSON 编辑双模式

高级匹配编辑器 SHALL 提供「JSON 编辑」切换，支持表单 ⇄ vars JSON 双向同步。

#### Scenario: 切换到 JSON 模式
- **WHEN** 用户开启「JSON 编辑」
- **THEN** 编辑区 SHALL 显示当前规则序列化后的 vars JSON（格式化）
- **THEN** 表单编辑区 SHALL 隐藏，JSON 文本区 SHALL 可编辑

#### Scenario: 从 JSON 切回表单
- **WHEN** 用户关闭「JSON 编辑」且 JSON 合法
- **THEN** 编辑器 SHALL 解析 JSON 并还原为规则列表（表单模式）
- **WHEN** JSON 非法或结构错误（非数组、非 3/4 元组）
- **THEN** 编辑器 SHALL 显示具体错误提示且保持 JSON 模式，SHALL NOT 切回表单

#### Scenario: JSON 模式保存
- **WHEN** 用户在 JSON 模式下保存
- **THEN** SHALL 以当前 JSON 解析结果作为 vars 提交

### Requirement: ~~* 语义修正

高级匹配的忽略大小写正则运算符 SHALL 为 `~~*`，与 Edge 手册一致。

#### Scenario: ~~* 可用且序列化正确
- **WHEN** 用户选择「忽略大小写正则」
- **THEN** 运算符值 SHALL 为 `~~*` 且序列化输出 `~~*`
- **THEN** 旧 `~*`（大小写敏感正则）SHALL 不再出现在运算符列表中

#### Scenario: 旧 ~* 数据反序列化兼容
- **WHEN** 路由 vars 包含旧格式 `[key, "~*", value]`
- **THEN** 编辑器 SHALL 将其识别为 `~~*`（忽略大小写正则）规则，value 原样保留

### Requirement: post_arg_* 变量前缀对齐

高级匹配的 POST 参数变量前缀 SHALL 为 `post_arg_`，与 Edge 手册 §9 一致。

#### Scenario: post_arg_ 序列化
- **WHEN** 用户配置 POST 参数类型规则
- **THEN** 序列化 SHALL 生成 `["post_arg_<key>", op, value]`

#### Scenario: 旧 postarg_ 数据兼容
- **WHEN** 路由 vars 包含旧格式 `["postarg_<key>", op, value]`
- **THEN** 编辑器 SHALL 将其识别为 POST 参数规则（type=postarg），key 还原为 `<key>`
- **THEN** 用户保存后 SHALL 升级为 `post_arg_` 前缀

### Requirement: 数组类运算符标签输入

`rx~`/`rx~*`/`in*` SHALL 与 `ip~`/`IN` 一致使用标签输入；`has`/`has*` SHALL 使用单行输入（手册语义：左值数组包含右值单值）。

#### Scenario: rx~ 标签输入
- **WHEN** 用户选择 `rx~`、`rx~*` 或 `in*` 运算符
- **THEN** value 控件 SHALL 切换为标签输入（可添加多个值）
- **THEN** 序列化 SHALL 生成 value 数组 `[key, op, [v1, v2]]`

#### Scenario: rx~ 反序列化
- **WHEN** 路由 vars 包含 `[key, "rx~", ["v1", "v2"]]` 或 `[key, "rx~*", ["v1", "v2"]]`
- **THEN** 编辑器 SHALL 显示为对应运算符规则，value 为数组

#### Scenario: has 单行输入
- **WHEN** 用户选择 `has` 或 `has*` 运算符
- **THEN** value 控件 SHALL 保持单行输入（手册示例 `["custom_names", "has", "user1"]`）
- **THEN** 序列化 SHALL 生成 `[key, "has", "user1"]`（value 为字符串，非数组）

#### Scenario: has 反序列化
- **WHEN** 路由 vars 包含 `[key, "has", "user1"]`
- **THEN** 编辑器 SHALL 显示为 `has` 规则，value 为字符串

### Requirement: 单值运算符行为不变

`==`、`!=`、`>`、`<`、`~~`、`==*`、`!=*`、`>=`、`<=`、`v>`、`v>=`、`v<`、`v<=`、`has`、`has*` SHALL 使用单行输入，序列化行为与现有单值运算符一致。
