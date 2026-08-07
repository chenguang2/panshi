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
- **WHEN** admin selects a method filter chip
- **THEN** the route list SHALL be filtered to routes matching that HTTP method

## ADDED Requirements

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

#### Scenario: 内置参数自由输入保留
- **WHEN** 用户添加任意内置参数条件（如 `remote_addr`、`http_x_forwarded_for`）
- **THEN** key 输入框 SHALL 保持自由文本输入，不限定变量列表

#### Scenario: 现有操作符行为不变
- **WHEN** 用户使用 `==`、`!=`、`>`、`<`、`~~`、`~*`、`IN`、`NOT IN` 任一操作符
- **THEN** 其序列化与反序列化行为 SHALL 与新增 ip~ 前完全一致
