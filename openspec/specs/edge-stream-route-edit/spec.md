# edge-stream-route-edit

## Purpose

在 Edge 直连页「四层代理」Tab 上提供 Stream 路由的新增与编辑能力（直改节点、绕过平台同步流程），
包含表单校验、监听端口冲突前置拦截、一致性哈希字段、全量替换写入时的字段保留、写操作审计归属，
以及在弹窗内提示"直连写入绕过平台同步"的作用域说明。

## Requirements

### Requirement: 添加四层代理

系统 SHALL 允许在 Edge 直连页「四层代理」Tab 直接向所选 Edge 节点新增 Stream 路由；该操作 SHALL 绕过平台同步流程（直改节点，与既有删除一致）。

#### Scenario: 打开新增表单

- **WHEN** 用户在「四层代理」Tab 点击「添加四层代理」
- **THEN** 系统 SHALL 弹出表单弹窗，字段包含：监听端口、名称、协议（TCP/UDP）、SNI、remote_addr、上游类型、上游协议、上游节点（地址 + 权重）
- **AND** 表单 SHALL 以空值初始态打开，监听端口与至少一个上游节点为必填

#### Scenario: 必填与范围校验

- **WHEN** 用户提交的表单缺少监听端口、监听端口超出 1–65535，或未填写任何上游节点
- **THEN** 系统 SHALL 阻止提交并提示对应错误，且不发出请求

#### Scenario: 监听端口冲突前置拦截

- **WHEN** 用户填写的监听端口与当前列表中其它 Stream 路由的 server_port 相同
- **THEN** 系统 SHALL 在提交前提示端口已被占用并阻止提交

#### Scenario: 提交新增

- **WHEN** 用户提交合法的表单
- **THEN** 前端 SHALL 调用 `POST /edge-client/nodes/{ip}/{port}/stream-routes`
- **AND** 由 Edge 节点分配新路由的 id
- **AND** 成功后系统 SHALL 关闭弹窗、重新加载四层代理列表（新路由出现在列表中）并提示成功

#### Scenario: 提交过程中禁止重复提交

- **WHEN** 用户已点击提交且请求尚未返回
- **THEN** 提交按钮 SHALL 处于禁用态，避免重复创建同名路由

#### Scenario: 上游为一致性哈希时的字段

- **WHEN** 用户选择上游类型为 `chash`
- **THEN** 表单 SHALL 显示「哈希位置」（hash_on）与「Key」输入
- **AND** 提交时 SHALL 随载荷发送 hash_on 与 key；非 chash 类型 SHALL NOT 发送

### Requirement: 编辑四层代理

系统 SHALL 允许修改 Edge 节点上已有的 Stream 路由；由于 Edge 侧写入为全量替换，保存时 SHALL 保留该路由上表单未覆盖的字段。

#### Scenario: 回填并保存

- **WHEN** 用户点击某行的「编辑」
- **THEN** 系统 SHALL 以该行的完整对象回填表单（监听端口、名称、协议、SNI、remote_addr、上游类型/协议/节点/哈希）
- **WHEN** 用户修改后提交
- **THEN** 前端 SHALL 将表单字段合并进完整对象后调用 `PUT /edge-client/nodes/{ip}/{port}/stream-routes/{id}`

#### Scenario: 表单未覆盖的字段被保留

- **WHEN** 被编辑的路由带有表单不覆盖的字段（如 `plugins`、`upstream.checks`、`upstream.pass_host`）
- **THEN** 提交载荷 SHALL 保留这些字段的原值
- **AND** 提交载荷中的 `upstream.nodes` SHALL 为表单中的节点集合（表单对节点全权覆盖）

#### Scenario: 编辑失败不关闭弹窗

- **WHEN** 提交时后端返回错误
- **THEN** 系统 SHALL 显示错误提示且不关闭弹窗，保留用户已填内容

#### Scenario: 编辑不改变路由身份

- **WHEN** 用户保存编辑
- **THEN** 系统 SHALL 使用该行原有的 id 作为写入路径，不得生成新 id

### Requirement: 四层代理写操作的审计归属

系统 SHALL 将 Edge 直连的四层代理新增/修改/删除记入审计日志，资源标识 SHALL 为四层代理而非节点级操作。

#### Scenario: 写操作被审计

- **WHEN** 通过平台新增、修改或删除 Edge 节点上的 Stream 路由
- **THEN** `sys_audit_log` SHALL 记录资源 `edge_stream_route` 对应的 create / update / delete 动作
- **AND** 审计日志前端 SHALL 以中文标签「Edge 四层代理」展示该资源

### Requirement: 直连写入的作用域提示

系统 SHALL 在四层代理表单弹窗内提示该写入直改节点、绕过平台同步流程。

#### Scenario: 弹窗提示

- **WHEN** 用户打开四层代理的添加或编辑弹窗
- **THEN** 弹窗 SHALL 显示"绕过平台同步流程；如需纳入平台管理请在集群侧创建后发布"一类提示
