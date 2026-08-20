## ADDED Requirements

### Requirement: 自启动状态持久化

系统 SHALL 将每个节点的自启动状态持久化到 `ps_node_autostart` 表（每节点一行），供页面读库展示，刷新页面不丢失。

#### Scenario: 读库展示状态
- **WHEN** 用户进入自启动管理页面
- **THEN** 系统 SHALL 从 `ps_node_autostart` 表读取各节点状态并展示
- **AND** 无需逐个实时查询

#### Scenario: 操作后更新记录
- **WHEN** 用户对节点执行启用/禁用/查询状态
- **AND** 操作成功
- **THEN** 系统 SHALL 更新 `ps_node_autostart` 中该节点的状态、最近操作、rc 与更新时间

#### Scenario: 刷新同步真实状态
- **WHEN** 用户在页面点击"刷新"
- **THEN** 系统 SHALL 重新查询各节点真实自启动状态并更新记录

### Requirement: 操作命令脱敏记录

系统 SHALL 在 `ps_node_autostart.command` 中记录最近一次操作的命令，且**密码必须脱敏**，绝不存 root 密码明文。

#### Scenario: 命令密码脱敏
- **WHEN** 系统记录操作命令（含 `sshpass -p <密码>`）
- **THEN** 库中 `command` 字段 SHALL 将密码替换为 `*****`
- **AND** 不得包含 root 密码明文

#### Scenario: 前端命令 tab 展示真实命令
- **WHEN** 用户查看结果抽屉的"命令" tab
- **THEN** 系统 SHALL 展示完整可执行的真实命令（含密码，用于手工执行），不影响库中脱敏记录
