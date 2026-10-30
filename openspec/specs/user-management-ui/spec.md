# 用户管理 UI

用户管理页面的 UI 展示能力，包括用户列表的列渲染、权限标签展示、编辑表单布局。

## 需求

### 用户列表表格列宽适配

用户列表表格的角色列和状态列 SHALL 有合适的固定宽度，角色列宽度 100px，状态列宽度 80px，与设计稿一致。

#### 角色列紧凑显示
- **WHEN** 用户打开用户管理页面
- **THEN** 角色列使用固定宽度 100px，角色标签（管理员/普通用户）完整显示

#### 状态列紧凑显示
- **WHEN** 用户打开用户管理页面
- **THEN** 状态列使用固定宽度 80px，状态标签（启用/禁用）完整显示

### 权限列显示用户权限标签

用户列表的权限列 SHALL 显示用户的实际权限标签，而非占位文本。对非管理员用户，根据 `permissions` 字段渲染对应的中文权限标签；对管理员显示"全部权限"；对无权限用户显示"—"。

#### 非管理员用户显示权限标签
- **WHEN** 用户为非管理员角色且拥有权限
- **THEN** 权限列中显示该用户所有权限的中文标签，每个标签使用 `perm-tag` 样式，标签间有间距

#### 非管理员用户无权限
- **WHEN** 用户为非管理员角色且 `permissions` 为空数组
- **THEN** 权限列显示"—"

#### 管理员权限列显示
- **WHEN** 用户为管理员角色
- **THEN** 权限列显示"全部权限"

### 编辑页面权限名称统一

编辑页面的权限列表中，`edge_nodes` 权限的显示名称 SHALL 为"Edge直连"，与侧边栏菜单一致。

#### 权限列表显示正确名称
- **WHEN** 编辑非管理员用户的权限
- **THEN** 权限列表中显示"Edge直连"而非"边缘节点管理"

### 重置密码输入框宽度

编辑模式的"重置密码"区域中，密码输入框 SHALL 限制宽度，确保输入框和"重置密码"按钮在同一行显示。

#### 重置密码在一行显示
- **WHEN** 编辑用户时看到重置密码区域
- **THEN** 密码输入框宽度受限，与"重置密码"按钮水平排列在同一行

### 插件元数据权限

编辑用户时，资源权限列表中 SHALL 包含"插件元数据"选项。

#### 插件元数据可勾选
- **WHEN** 编辑非管理员用户的资源权限
- **THEN** 权限列表中显示"插件元数据"复选框

### Edge直连菜单权限控制

左侧导航栏的"Edge直连"菜单项 SHALL 根据用户权限控制显隐。如果用户没有 `edge_nodes` 权限，该菜单项不显示。

#### 无权限时隐藏
- **WHEN** 用户为非管理员且没有 `edge_nodes` 权限
- **THEN** 侧边栏不显示"Edge直连"菜单项

#### 有权限时显示
- **WHEN** 用户为管理员或拥有 `edge_nodes` 权限
- **THEN** 侧边栏显示"Edge直连"菜单项

### 集群页插件元数据 Tab 权限控制

集群详情页的"插件元数据" Tab SHALL 根据用户权限控制显隐。如果用户没有 `plugin_metadata` 权限，该 Tab 不显示。

#### 无权限时隐藏 Tab
- **WHEN** 用户为非管理员且没有 `plugin_metadata` 权限
- **THEN** 集群详情页不显示"插件元数据"Tab

### 后端返回用户权限和集群

`GET /admin/users` 接口的响应中 SHALL 包含每个用户的 `permissions`（权限列表）和 `cluster_ids`（集群 ID 列表）。

#### 用户列表带权限和集群
- **WHEN** 管理员请求用户列表
- **THEN** 每个用户对象包含 `permissions` 和 `cluster_ids` 字段

### 集群列标签 +N 显示

用户列表的集群列 SHALL 最多显示 3 个集群标签，超出部分显示 "+N" 标签，悬停查看全部。

#### 集群标签截断
- **WHEN** 用户被分配超过 3 个集群
- **THEN** 表格中仅显示前 3 个集群标签，追加 "+N" 虚框标签

#### 悬停查看全部
- **WHEN** 鼠标悬停在 "+N" 标签上
- **THEN** 弹出 tooltip 显示所有集群名称

### 编辑用户时分配集群

编辑用户弹窗中 SHALL 包含集群分配功能，支持按分组查看和选择集群。

#### 集群选择弹窗
- **WHEN** 管理员编辑用户时点击"选择集群"
- **THEN** 弹窗按 `group_name` 分组展示所有集群，支持组选和搜索

#### 保存集群分配
- **WHEN** 管理员保存用户编辑
- **THEN** 调用 `PUT /admin/users/{id}/clusters` 提交所选集群 ID

### 创建集群自动分配

创建集群时 SHALL 自动将集群分配给创建者（写入 `sys_user_cluster` 表）。

#### 创建后自动分配
- **WHEN** 用户创建集群
- **THEN** 自动在 `sys_user_cluster` 中插入一条记录

### 用户可见集群统一

非管理员用户的集群列表（`/clusters/my`）SHALL 仅根据 `sys_user_cluster` 表返回，不依赖 `creator_id`。

#### 一致性查询
- **WHEN** 非管理员用户请求我的集群
- **THEN** 仅返回 `sys_user_cluster` 表中分配给该用户的集群

## Purpose

用户管理 UI：管理员角色包含审计日志权限，审计日志模块受特性开关控制，前端按权限展示入口。

## Requirements

### Requirement: Admin user management includes audit log permission
The user management capability SHALL include a new permission key `audit_logs` (plural, consistent with existing keys like `clusters`, `routes`, `upstreams`) for accessing the audit log page.

#### Scenario: Admin has audit log permission by default
- **WHEN** system initializes default admin user
- **THEN** admin has `audit_logs` permission (via role=admin bypass)

#### Scenario: Regular user without audit_logs cannot access audit log
- **WHEN** user without `audit_logs` permission tries to visit `/audit-log`
- **THEN** frontend hides menu item; backend returns 403 on API call

#### Scenario: Permission assignment via user edit modal
- **WHEN** admin edits a user and grants "系统管理 → 审计日志" permission
- **THEN** `audit_logs` permission key is added to user's permissions
- **THEN** user sees audit log menu after token refresh (re-login or explicit token refresh)

#### Scenario: Permission change takes effect without full re-login
- **WHEN** admin grants `audit_logs` to user
- **THEN** frontend detects permission change (via periodic `/api/v1/auth/me` poll or manual refresh button)
- **THEN** menu appears without full re-login

### Requirement: Feature flag for audit_log module
The system SHALL add `audit_log` feature flag in `features.yaml` to gate the audit log module.

#### Scenario: Feature disabled hides module completely
- **WHEN** `features.yaml` has `audit_log: false`
- **THEN** audit log menu hidden for all users (including admin)
- **THEN** API endpoints return 404 or 403

#### Scenario: Feature enabled shows module per permission
- **WHEN** `features.yaml` has `audit_log: true`
- **THEN** menu visibility follows `system_audit` permission

### Requirement: 集群选择器暂存语义

编辑用户弹窗的集群选择器 SHALL 为暂存态语义：打开时快照当前已选集群，选择过程中的勾选/取消仅作用于暂存副本，「确认」将副本应用到表单，「取消」丢弃副本还原打开时状态（2026-10-30 UX 评审：原实现选择即时生效，「取消」按钮不还原，与按钮语义相悖）。既有「编辑用户时分配集群」requirement（分组展示/组选/搜索/保存时 `PUT /admin/users/{id}/clusters` 提交）保持不变。

#### 集群选择弹窗快照
- **WHEN** 管理员点击「选择集群」打开弹窗
- **THEN** 弹窗按 `group_name` 分组展示所有集群，支持组选和搜索
- **THEN** 打开时以当前已选集群为初始快照

#### 取消还原
- **WHEN** 管理员在集群选择弹窗中勾选/取消若干集群后点击「取消」
- **THEN** 已选集群集合还原为打开弹窗时的快照，勾选过程不生效

#### 确认应用
- **WHEN** 管理员点击「确认」
- **THEN** 弹窗关闭，勾选结果应用为表单的已选集群

### Requirement: 用户列表排序语义唯一

用户列表 SHALL 恒按后端返回顺序（创建顺序）展示，表头不提供列排序控件（后端 `list_users` 无排序参数，前端 sorter 只重排当前页，跨页语义错误——2026-10-30 UX 评审，与 audit-log-ui 裁决同型）。

#### Scenario: 无列头排序控件
- **WHEN** 管理员打开 `/users`
- **THEN** 用户名/角色/状态/创建时间表头无排序箭头

### Requirement: 状态切换需确认且说明即时生效语义

状态列 SHALL 提供显式切换控件（a-switch）；点击后 SHALL 弹出确认，文案说明禁用立即生效——该用户将立即下线且无法登录（后端 `get_current_user` 对 status≠1 返回 401，已登录会话即刻失效）。初始管理员（id=1）不可禁用，尝试时提示「不能禁用初始管理员」。

#### Scenario: 禁用用户需确认
- **WHEN** 管理员将启用用户的状态开关切为禁用
- **THEN** 弹出确认「确定禁用用户 xxx 吗？该用户将立即下线且无法登录」
- **WHEN** 确认
- **THEN** 调用更新接口，成功后状态列与 toast 同步

#### Scenario: 取消不生效
- **WHEN** 管理员在确认弹窗点击取消
- **THEN** 开关回弹，不发请求

#### Scenario: 初始管理员保护
- **WHEN** 管理员尝试禁用 id=1 的初始管理员
- **THEN** 提示「不能禁用初始管理员」，不发请求

### Requirement: 删除用户需说明级联后果

删除用户确认弹窗 SHALL 说明级联清除后果：「将一并清除其资源权限与集群授权，且不可恢复」（后端 delete 级联删除 `sys_user_permission`/`sys_user_cluster`）。管理员用户（role=admin）不可删除，尝试时提示「不能删除管理员用户」。

#### Scenario: 删除确认含后果说明
- **WHEN** 管理员点击删除用户
- **THEN** 确认弹窗显示用户名与级联清除、不可恢复说明
- **WHEN** 确认
- **THEN** 删除成功后列表刷新

### Requirement: 重置密码需二次确认

编辑弹窗的「重置密码」SHALL 在执行前弹出二次确认，说明「该用户当前密码将立即失效，请将新密码告知用户」。取消则不调用接口。

#### Scenario: 重置密码确认
- **WHEN** 管理员输入新密码点击「重置」
- **THEN** 弹出确认弹窗
- **WHEN** 确认
- **THEN** 调用重置接口，成功后清空输入框并提示成功

### Requirement: 角色切换保留权限勾选

新建/编辑弹窗中切换角色（admin↔user）SHALL 保留已勾选的资源权限（admin 角色下权限区不渲染但内存保留，切回 user 恢复显示与勾选）；保存时 admin 角色不提交权限（现状后端仅非 admin 提交）。禁止在角色切换时静默清空勾选（2026-10-30 UX 评审：原实现清空 `selectedPermKeys`，普通用户误切 admin 再切回、保存即丢全部权限——数据丢失风险）。

#### Scenario: 切换角色不清空勾选
- **WHEN** 管理员编辑已勾选权限的普通用户，角色切到管理员再切回普通用户
- **THEN** 原勾选完整恢复

### Requirement: 筛选与反馈文案

搜索 SHALL 为 a-input-search（回车/防抖触发，300ms，查询前去首尾空格）；角色/状态筛选 SHALL 为可搜索 a-select。列表空态 SHALL 双形态：有筛选时「无匹配用户」+ 清除筛选按钮（点击清空全部筛选并刷新），真空库才显示「暂无用户」。错误提示 SHALL 说明原因或下一步动作，禁止裸「操作失败」。

#### Scenario: 搜索防抖与空态
- **WHEN** 管理员连续输入关键字
- **THEN** 停止输入 300ms 后才发起一次请求
- **WHEN** 筛选无结果
- **THEN** 显示「无匹配用户」与「清除筛选」按钮
- **WHEN** 点击清除筛选
- **THEN** 搜索框/角色/状态全部还原，列表刷新
