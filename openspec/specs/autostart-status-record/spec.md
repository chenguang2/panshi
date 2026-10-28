## Purpose

持久化记录每个 Edge 节点的自启动状态与最近一次操作的脱敏命令，供自启动管理页面读库展示（刷新页面不丢失），并提供操作审计。命令中的 root 密码必须脱敏，绝不存明文。

## Requirements

### Requirement: 自启动状态持久化

系统 SHALL 将每个节点的自启动状态持久化到 `ps_node_autostart` 表（每节点一行），供页面读库展示。页面 SHALL 透出记录的新鲜度与最近操作信息（最后查询/操作时间、最后操作类型），使「已启用」等标签的可信度可判断；「刷新」SHALL 为读库重载动作，真实状态的同步 SHALL 由显式的批量查询动作承担（对选中节点或当前筛选全量逐节点实查并更新记录）；库中无记录的节点 SHALL 显示「未查询」，查询失败（未能推导真实态）SHALL 显示失败态而非「未知」，两者 MUST NOT 混同。

#### Scenario: 读库展示状态
- **WHEN** 用户进入自启动管理页面
- **THEN** 系统 SHALL 从 `ps_node_autostart` 表读取各节点状态并展示
- **AND** 无需逐个实时查询

#### Scenario: 操作后更新记录
- **WHEN** 用户对节点执行启用/禁用/查询状态
- **AND** 操作成功
- **THEN** 系统 SHALL 更新 `ps_node_autostart` 中该节点的状态、最近操作、rc 与更新时间

#### Scenario: 刷新同步真实状态
<!-- 标题为稳定标识符，保留不改名；语义按 2026-10-27 评审裁决拆分为「重载（读库）」与「批量查询（真实同步）」两个动作 -->
- **WHEN** 用户点击「重载」（原「刷新」）
- **THEN** 系统 SHALL 重新读取节点清单与 `ps_node_autostart` 记录并更新表格
- **AND** 该动作 MUST NOT 被理解为对节点的真实状态查询
- **WHEN** 用户对选中节点（或当前筛选全量）发起批量查询状态
- **THEN** 系统 SHALL 逐节点执行真实状态查询并更新记录与表格
- **AND** 完成后 SHALL 展示汇总（各节点真实状态与失败节点原因）

#### Scenario: 状态新鲜度可见
- **WHEN** 用户查看某节点的自启动状态
- **THEN** SHALL 同时看到该状态的最后查询/操作时间与最后操作类型
- **AND** 最后查询时间超过 7 天的真实态 SHALL 提示「状态可能过期」（tooltip，不作警示色）

#### Scenario: 未查询与查询失败可区分
- **GIVEN** 节点在库中无自启动记录
- **WHEN** 用户查看该节点状态列
- **THEN** SHALL 显示「未查询」（非失败语义）
- **WHEN** 某节点最近一次查询未能推导真实态（权限受限或输出无法识别）
- **THEN** SHALL 显示对应失败态（查询受限/查询失败），MUST NOT 显示「未知」或覆盖既有真实态（既有持久化守卫不变）

### Requirement: 操作命令脱敏记录

系统 SHALL 在 `ps_node_autostart.command` 中记录最近一次操作的命令，且**密码必须脱敏**，绝不存 root 密码明文。

#### Scenario: 命令密码脱敏
- **WHEN** 系统记录操作命令（含 `sshpass -p <密码>`）
- **THEN** 库中 `command` 字段 SHALL 将密码替换为 `*****`
- **AND** 不得包含 root 密码明文

#### Scenario: 前端命令 tab 展示真实命令
- **WHEN** 用户查看结果抽屉的"命令" tab
- **THEN** 系统 SHALL 展示完整可执行的真实命令（含密码，用于手工执行），不影响库中脱敏记录

### Requirement: 未获实际状态不覆盖最后已知真实态

任何自启动操作（启用/禁用/状态查询）的持久化，系统 SHALL 以命令**实际输出**推导状态；当未能从输出推导出真实态（`enabled`/`disabled`/`not_configured`）时，SHALL NOT 用失败结果（`permission_denied`/`unknown`）或操作期望值覆盖 `ps_node_autostart.status` 中的最后已知真实态。该次操作的 `action`、`rc`、脱敏命令与更新时间 SHALL 照常记录。节点无真实态记录时，SHALL 如实写入推导结果（如 `permission_denied`），MUST NOT 写入误导性成功态。

#### Scenario: 无权限查询后保持最后已知状态
- **WHEN** 库中已有状态（如 `disabled`），用户以无 systemctl 权限的账号执行状态查询（输出仅含权限错误）
- **THEN** 库中 `status` SHALL 保持 `disabled`
- **AND** 页面表格继续显示"已禁用"，本次查询的失败 `rc` 与 `action='status'` 照常落库

#### Scenario: enable/disable 失败不抹已知状态
- **WHEN** 启用/禁用操作失败（如 root 密码错误导致 SSH 认证失败，无有效输出）
- **THEN** `status` SHALL 保持原真实态，MUST NOT 被写为 `unknown`
- **AND** 失败的 `action`/`rc` 照常记录

#### Scenario: 禁用假成功时写入实际值
- **WHEN** 禁用操作执行完毕（命令因 `|| true` 恒返回 rc=0）但 `systemctl is-enabled` 实际输出为 `enabled`
- **THEN** `status` SHALL 写入 `enabled`（实际状态），MUST NOT 写入操作期望值 `disabled`

#### Scenario: 推导出真实态即正常刷新
- **WHEN** 任一操作从输出推导出 `enabled`/`disabled`/`not_configured`（含 is-enabled 对 disabled 返回 rc=1 但有真实输出的情况）
- **THEN** 系统 SHALL 以推导结果更新 `status`（判据为输出内容而非 rc）

### Requirement: 持久化失败可观测

自启动操作结果的写库过程发生异常时，系统 SHALL 记录含堆栈的错误日志，MUST NOT 静默吞掉异常；流式响应的正常收尾不受写库失败影响。

#### Scenario: 写库异常留下日志
- **WHEN** 自启动持久化写库过程中抛出任何异常
- **THEN** 日志中 SHALL 出现含异常堆栈的记录
- **AND** SSE 流仍正常返回操作结果
