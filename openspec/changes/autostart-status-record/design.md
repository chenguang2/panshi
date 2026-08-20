## Context

自启动状态目前仅前端内存保存，刷新即失。需持久化状态与脱敏操作命令，实现状态读库展示与操作审计。

**安全约束**：SSH 命令含 `sshpass -p <root密码>`，直接落库泄露密码明文，必须脱敏。

## Goals / Non-Goals

**Goals:**
- 持久化每个节点的自启动状态（读库展示，刷新页面不丢）。
- 记录最近一次操作的脱敏命令（审计）。
- 命令密码脱敏，绝不存明文。

**Non-Goals:**
- 不做完整的多版本操作历史（仅记录最近一次；如需完整审计留待后续）。
- 不持久化 root 密码。

## Decisions

### 决策 1：新建表 `ps_node_autostart`（每节点一行）

字段：
- `id` Integer PK
- `node_id` Integer FK→ps_node（唯一）
- `cluster_id` Integer FK→ps_cluster
- `status` String（enabled/disabled/not_configured/permission_denied/unknown）
- `action` String（enable/disable/status，最近一次操作）
- `command` Text（脱敏后的命令）
- `rc` Integer
- `updated_at` DateTime

每节点一行（node_id 唯一），记录"当前状态 + 最近一次操作"。新表由 `Base.metadata.create_all` 自动创建，无需 alter 迁移。

**理由**：状态是"当前值"而非历史序列，每节点一行最简洁；操作审计取最近一次命令即可满足当前需求。

### 决策 2：命令脱敏

写库前对 command 脱敏：把 `sshpass -p <密码>` 中的密码替换为 `*****`。

实现一个 `sanitize_command_for_store(command)` 函数（或复用现有脱敏逻辑），用正则匹配 `sshpass -p (\S+)` 替换密码。**后端返回 SSE 的原始命令不变**（用于前端命令 tab 展示），仅**写库时**脱敏。

**理由**：前端命令 tab 需展示真实可执行命令（含密码用于手工执行），但库中记录必须脱敏。

### 决策 3：写库时机

- 启用/禁用/查询操作完成后，用操作结果（status/action/脱敏 command/rc）**upsert** 该节点记录。
- 操作结果状态来源：enable/disable 直接用操作成功后的预期状态；status 用解析出的真实状态。

### 决策 4：读库接口与同步

- 新增 `GET /nodes/autostart/records`：返回所有节点的自启动记录（读库），前端进入页面时调用展示。
- 前端"刷新"按钮：逐个重新查询（现有 status 接口）并写库，同步真实状态。

**理由**：进入页面读库（快），刷新时实时同步，兼顾性能与准确性。

## Risks / Trade-offs

- [库状态与节点实际状态可能不同步（节点被外部修改）] → 提供"刷新"重新查询同步；状态页标注"读库状态，可刷新同步"。
- [脱敏正则遗漏密码格式] → 用 `sshpass -p (\S+)` 覆盖常见格式，并测试验证。

## Migration Plan

1. 新增 `NodeAutostart` 模型（新表，create_all 自动创建）。
2. `edge_autostart.py` 操作后 upsert 记录 + 脱敏函数。
3. 新增读库接口；前端进入加载 + 刷新同步。
4. 无数据迁移（新表）。

## Open Questions

- 是否需要在页面展示"操作时间/操作人"？当前记录 `updated_at`，operator 待定（用户未要求，默认不加）。
