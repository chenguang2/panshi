# Route Management

## Purpose

Provide a dedicated page for admins to manage API routes across all clusters from a single view.

## Requirements

### Requirement: Route management page

Admins SHALL be able to view, search, filter, create, copy, edit, delete, publish, and version-manage routes from a dedicated page.

#### Scenario: Page layout
- **WHEN** admin navigates to `/routes`
- **THEN** a page SHALL display with PageHeader title "路由管理"
- **THEN** a cluster filter dropdown SHALL be in the page header
- **THEN** a "新建路由" button SHALL be in the page header
- **THEN** "发布全部" button SHALL NOT appear

#### Scenario: Method filter chips
- **WHEN** the page loads
- **THEN** HTTP method filter chips SHALL appear: 全部, GET, POST, PUT, DELETE, PATCH

#### Scenario: Filter bar
- **WHEN** the page loads
- **THEN** a search input SHALL filter by name/URI/description
- **THEN** a publish status dropdown SHALL filter (全部/已发布/未发布)
- **THEN** a plugin dropdown SHALL filter by plugin name (options from `/plugins/builtin`)
- **THEN** the API SHALL support `method` parameter for method chip filtering
- **THEN** the API SHALL support `publish_status` parameter (published/unpublished) by checking ConfigVersion records
- **THEN** the API SHALL support `plugin` parameter to filter by RoutePlugin.plugin_name
- **THEN** a count SHALL show "共 N 条路由"

#### Scenario: Table display
- **WHEN** routes exist
- **THEN** a table SHALL show columns: name+description, URI, methods, cluster, priority, version, created time, actions
- **THEN** the status column SHALL NOT appear (replaced by version)
- **THEN** pagination SHALL be supported

#### Scenario: Action menu
- **WHEN** admin clicks the action button (⋯)
- **THEN** a dropdown SHALL show: 复制路由, 编辑, 发布, 版本管理, 删除
- **THEN** 禁用 SHALL NOT appear in the menu

#### Scenario: Create/Edit route
- **WHEN** admin clicks "新建路由" or "编辑"
- **THEN** RouteFormModal SHALL open with fields matching cluster route form
- **THEN** "所属集群" SHALL be present (editable on create, readonly on edit)
- **ON SAVE** the route SHALL be created/updated via existing API

#### Scenario: Copy route
- **WHEN** admin clicks "复制路由"
- **THEN** a copy of the route SHALL be created via existing API

#### Scenario: Delete route
- **WHEN** admin clicks "删除"
- **THEN** the existing delete function from useClusterRoutes SHALL be used

#### Scenario: Publish route
- **WHEN** admin clicks "发布"
- **THEN** the existing publish function from useClusterRoutes SHALL be used

#### Scenario: Version management
- **WHEN** admin clicks "版本管理"
- **THEN** the existing VersionManagementModal SHALL be used

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

### Requirement: post_arg_ 变量前缀对齐

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

### Requirement: 路由高级匹配支持 IP 范围条件

路由高级匹配编辑器 SHALL 支持 IP 范围/CIDR 匹配条件，允许按客户端 IP 段进行路由分流。

#### Scenario: IP 匹配操作符
- **WHEN** 用户在高级匹配编辑器中选择「IP 匹配（ip~）」操作符
- **THEN** 操作符下拉 SHALL 包含「IP 匹配（ip~）」选项
- **THEN** value 输入 SHALL 切换为标签输入，每个标签为一个 IP 或 CIDR
- **THEN** 序列化 SHALL 生成 3 元组 vars：`["remote_addr", "ip~", ["10.158.40.51", "10.0.0.0/8"]]`（value 为数组）

#### Scenario: 非 IP 匹配操作符（取反）
- **WHEN** 用户选择「非 IP 匹配（not_ip~）」操作符
- **THEN** 操作符下拉 SHALL 包含「非 IP 匹配（not_ip~）」选项
- **THEN** value 输入 SHALL 切换为标签输入
- **THEN** 序列化 SHALL 生成 4 元组取反 vars：`["remote_addr", "!", "ip~", ["192.168.0.3", "127.0.0.1/8"]]`

#### Scenario: 反序列化识别两种格式
- **WHEN** 路由 vars 包含 3 元组 `["remote_addr", "ip~", [list]]`
- **THEN** 编辑器 SHALL 显示为「IP 匹配」规则，value 为对应列表
- **WHEN** 路由 vars 包含 4 元组 `["remote_addr", "!", "ip~", [list]]`
- **THEN** 编辑器 SHALL 显示为「非 IP 匹配」规则，value 为对应列表

#### Scenario: 4 元组不被固定 3 元组解构错解
- **WHEN** 路由 vars 包含 4 元组 `["remote_addr", "!", "ip~", [list]]`
- **THEN** 解析 SHALL 前置判断 `v.length === 4 && v[1] === "!" && v[2] === "ip~"` 走独立分支
- **THEN** operator SHALL NOT 为 `"!"`、value SHALL NOT 为 `"ip~"`、list SHALL NOT 丢失

#### Scenario: 旧数据 value 兼容拆分
- **WHEN** 3 元组 `ip~` 的 value 为非数组字符串（旧数据/手写）
- **THEN** 编辑器 SHALL 按逗号拆分为数组
- **WHEN** 4 元组取反的 `v[3]` 为非数组字符串
- **THEN** 编辑器 SHALL 拆分为单元素数组 `[v[3]]`（不按逗号拆分）

#### Scenario: 内置参数自由输入保留
- **WHEN** 用户添加任意内置参数条件（如 `remote_addr`、`http_x_forwarded_for`）
- **THEN** key 输入框 SHALL 保持自由文本输入，不限定变量列表
- **WHEN** 用户为任意变量类型（header/query/postarg/cookie/builtin）选择 `ip~`/`not_ip~` 操作符
- **THEN** 编辑器 SHALL 允许搭配，不限定只能用于 builtin 类型（评审确认）

### Requirement: IN/NOT IN 操作符标签输入与序列化修正

路由高级匹配的 `IN`（包含）/ `NOT IN`（不包含）操作符 SHALL 使用标签输入，并按 Edge `in`/`!in` 数组格式序列化。

#### Scenario: IN 操作符标签输入
- **WHEN** 用户在高级匹配编辑器中选择「包含（IN）」操作符
- **THEN** value 输入 SHALL 切换为标签输入，每个标签为一个匹配值
- **THEN** 序列化 SHALL 生成 `[key, "in", ["user1","user2"]]`（小写 `in`，value 为数组）

#### Scenario: NOT IN 操作符标签输入与 4 元组取反
- **WHEN** 用户选择「不包含（NOT IN）」操作符
- **THEN** value 输入 SHALL 切换为标签输入
- **THEN** 序列化 SHALL 生成 4 元组取反 `[key, "!", "in", ["user1","user2"]]`

#### Scenario: 反序列化识别小写 in 格式
- **WHEN** 路由 vars 包含 3 元组 `["arg_name", "in", [list]]`
- **THEN** 编辑器 SHALL 显示为「包含」规则，value 为对应列表
- **WHEN** 路由 vars 包含 4 元组 `["arg_name", "!", "in", [list]]`
- **THEN** 编辑器 SHALL 显示为「不包含」规则，value 为对应列表
- **THEN** 4 元组 SHALL 前置判断识别，operator SHALL NOT 为 `"!"`、value SHALL NOT 为 `"in"`

#### Scenario: 旧大写字符串数据兼容
- **WHEN** 路由 vars 包含旧格式 `["arg_name", "IN", "user1,user2"]`（大写 + 字符串）
- **THEN** 编辑器 SHALL 显示为「包含」规则，value 按逗号拆分为数组
- **WHEN** 路由 vars 包含旧格式 `["arg_name", "NOT IN", "user1,user2"]`
- **THEN** 编辑器 SHALL 显示为「不包含」规则，value 按逗号拆分为数组

#### Scenario: 列表操作符统一抽象
- **WHEN** 用户使用 `ip~`、`not_ip~`、`IN`、`NOT IN` 任一列表操作符
- **THEN** value 控件 SHALL 统一使用标签输入（`isListOperator` 判断）
- **THEN** `ip~`/`not_ip~` SHALL 显示 IP/CIDR 提示，`IN`/`NOT IN` SHALL 显示通用值提示（`isIpOperator` 区分）

#### Scenario: 操作符职责分离
- **WHEN** 组件判断 value 控件类型
- **THEN** `isListOperator` SHALL 对 `ip~`/`not_ip~`/`IN`/`NOT IN` 返回 true（控件切换）
- **THEN** `isIpOperator` SHALL 仅对 `ip~`/`not_ip~` 返回 true（placeholder 区分），`isIpOperator('IN')` SHALL 返回 false

#### Scenario: 4 元组 type 推导（header 类型 NOT IN/not_ip~）
- **WHEN** 路由 vars 包含 `["http_x_real_ip", "!", "in", [list]]`（header 类型 + NOT IN 4 元组）
- **THEN** 编辑器 SHALL 显示为「不包含」规则，type SHALL 为 header（非 builtin）
- **WHEN** 路由 vars 包含 `["http_x_real_ip", "!", "ip~", [list]]`（header 类型 + not_ip~ 4 元组）
- **THEN** 编辑器 SHALL 显示为「非 IP 匹配」规则，type SHALL 为 header（修复现有硬编码 builtin 的 bug）
- **THEN** 4 元组分支 SHALL 复用 `deriveRuleType` 推导 type（`arg_`/`http_`/`postarg_`/`cookie_`/无前缀）

### Requirement: 单值运算符行为不变

`==`、`!=`、`>`、`<`、`~~`、`==*`、`!=*`、`>=`、`<=`、`v>`、`v>=`、`v<`、`v<=`、`has`、`has*` SHALL 使用单行输入，序列化行为与现有单值运算符一致。

#### Scenario: 单值运算符保持单行输入
- **WHEN** 用户使用 `==`、`!=`、`>`、`<`、`~~`、`==*`、`!=*`、`>=`、`<=`、`v>`、`v>=`、`v<`、`v<=`、`has`、`has*` 任一单值运算符
- **THEN** value 输入 SHALL 使用单行输入，序列化行为与现有单值运算符一致

### Requirement: WebSocket 开关保存后回填一致

路由编辑表单 SHALL 在保存后再次编辑时正确回填「启用 WebSocket」勾选状态，与数据库一致。

#### Scenario: 勾选保存后回填选中
- **WHEN** 用户勾选「启用 WebSocket」并保存路由
- **THEN** API 响应与列表数据 SHALL 返回 `enable_websocket: true`
- **THEN** 再次编辑该路由时 checkbox SHALL 为选中状态

#### Scenario: 取消勾选后清除 DB 值
- **WHEN** 用户取消勾选「启用 WebSocket」并保存
- **THEN** 保存请求 SHALL 携带 `enable_websocket: false`（非缺席）
- **THEN** 数据库该字段 SHALL 更新为 false
- **THEN** 再次编辑时 checkbox SHALL 为未选中状态

#### Scenario: 两处表单入口一致
- **WHEN** 用户在独立路由管理页或统一管理页编辑路由
- **THEN** 两处入口 SHALL 均正确回填与保存 WebSocket 状态

### Requirement: 高级匹配行内提示动态化

高级匹配的行内提示 SHALL 随当前条件的变量名与值实时更新，不使用固定示例。

#### Scenario: 单值条件提示
- **WHEN** 条件为 header 类型、key=Host、operator=等于、value=example.com
- **THEN** 行内提示 SHALL 显示「等于匹配：http_host == example.com」（变量名与值均为实际条件）

#### Scenario: 数组条件提示
- **WHEN** 条件为 builtin、key=req_uri、operator=rx~、value=['/a','/b']
- **THEN** 行内提示 SHALL 显示「路径匹配优化版 in：req_uri rx~ [/a, /b]」（数组值格式化显示）
