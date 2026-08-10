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

## ADDED Requirements

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

#### Scenario: 单值操作符行为不变
- **WHEN** 用户使用 `==`、`!=`、`>`、`<`、`~~`、`~*` 任一单值操作符
- **THEN** 其 value 输入与序列化行为 SHALL 与本次改动前完全一致

#### Scenario: in* 大小写变体不引入
- **WHEN** 用户使用「包含（IN）」操作符
- **THEN** 序列化 SHALL 使用 `in`（大小写敏感），SHALL NOT 引入 `in*` 变体（评审确认：本次不做）
