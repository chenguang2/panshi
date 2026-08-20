## Why

自启动管理页面的自启动状态目前仅保存在前端内存（`node.autostart_status` ref），刷新页面后即丢失，需重新逐个查询。且启用/禁用/查询执行的命令没有历史记录，无法审计"何时对哪个节点做了什么操作"。需要将状态与操作记录持久化到数据库。

**安全约束**：执行的 SSH 命令含 `sshpass -p <密码>`，直接落库会泄露 root 密码明文，**必须脱敏**（密码替换为 `*****`）。

## What Changes

- 新增表 `ps_node_autostart`，记录每个节点的自启动状态与最近一次操作（action、状态、脱敏命令、rc、更新时间）。
- 自启动管理页面**进入时读库**展示状态（无需逐个实时查询）；"刷新"可重新查询并同步真实状态。
- 启用/禁用/查询操作成功后**写库**，更新该节点状态与脱敏命令记录。
- 命令中的密码**脱敏**（`sshpass -p xxx` → `sshpass -p *****`），绝不存明文。

## Capabilities

### New Capabilities
- `autostart-status-record`: 持久化记录节点自启动状态与脱敏操作命令。

### Modified Capabilities
<!-- 无现有 spec 需求变化 -->

## Impact

- **后端**：`models` 新增 `NodeAutostart` 模型（`ps_node_autostart` 表）；`edge_autostart.py` API 在操作后写库；新增读库/同步接口；命令脱敏函数。
- **前端**：`EdgeAutostart.vue` 进入时从读库接口加载状态，操作后刷新；"刷新"重新查询同步。
- **迁移**：新增表由 `Base.metadata.create_all` 创建（新表，无需 alter）。
- **安全**：命令记录必须脱敏，杜绝 root 密码落库。
