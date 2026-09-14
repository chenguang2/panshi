## Context

数据库管理页面当前有两个层面的任务可能阻塞写操作：

1. **数据库迁移锁**（`maintenance.py`）：迁移期间设置 `threading.Event` 锁，所有 POST/PUT/DELETE/PATCH 请求返回 503
2. **节点任务**（`NodeTask` 模型）：Ansible 节点操作任务（安装/启停/分发等）可能正在运行，影响数据库切换等操作

用户在遇到写操作被拒绝时，无法看到是哪些任务在运行。数据库管理页面需要一个"当前任务"区域来展示这些信息。

### 现有代码关键路径
- `maintenance.set_migration_in_progress(True/False)` — 迁移开始/结束时设置
- `NodeTask` 模型 — `status = "running"` / `"pending"` 表示正在执行或排队
- `db_switch_service._find_running_tasks(db)` — 已有查询运行中节点任务的逻辑
- `database.py` 路由前缀 `/database`
- `recover_interrupted_tasks()` — 启动时将所有 pending/running 任务标记为 failed，无需担心 stale 任务

## Goals / Non-Goals

**Goals:**
- 后端提供聚合 API，一次性返回迁移状态（含源/目标/开始时间）+ 运行中+排队中的节点任务列表（含集群名称）
- 前端在数据库管理页面顶部展示"当前任务"卡片
- 无任务运行时显示空状态提示
- 用户可手动刷新任务列表
- 改造 maintenance 模块，迁移锁携带元数据

**Non-Goals:**
- 不做实时推送（SSE/WebSocket）— 任务列表不需要秒级实时
- 不做任务取消/干预操作（仅展示）
- 不做任务历史（已有迁移历史功能）
- 不做 DB 持久化迁移锁状态（重启自动清零即可）

## Decisions

### D1: API 设计 — 单端点聚合

新增 `GET /database/running-tasks` 端点，返回格式：

```json
{
  "migration": {
    "in_progress": true,
    "source_id": "conn_abc",
    "target_id": "conn_xyz",
    "started_at": "2026-09-12T10:00:00"
  },
  "node_tasks": [
    {
      "id": 12,
      "task_type": "install",
      "cluster_id": 5,
      "cluster_name": "生产集群",
      "status": "running",
      "total_nodes": 3,
      "success_nodes": 1,
      "started_at": "2026-09-12T10:00:00"
    },
    {
      "id": 13,
      "task_type": "distribute_file",
      "cluster_id": 2,
      "cluster_name": "测试集群",
      "status": "pending",
      "total_nodes": 5,
      "success_nodes": 0,
      "started_at": null
    }
  ]
}
```

**选择理由**：单次请求获取全部信息，避免前端多次调用。`migration` 字段为 null 时表示无迁移，有值时包含详情。`node_tasks` 包含 running + pending 状态的任务（recover 已在启动时清理 stale 任务，DB 中的 pending 一定是本次启动后新建的）。

### D2: 前端展示 — 卡片布局

在"当前数据库"卡片和"连接列表"卡片之间插入"当前任务"卡片：

- 有任务时：显示任务列表，每行包含任务类型（中文，前端维护映射表）、集群名称、进度（success/total）、开始时间
- 无任务时：显示"a-alert info"提示"当前没有正在执行的任务"
- 迁移锁激活时：额外显示迁移锁警告提示，含源→目标连接信息

**选择理由**：与现有页面的卡片风格一致，信息层级清晰。task_type 中文映射由前端维护（复用 node-task-center 已有的映射），后端只返回原始英文 type。

### D3: 数据查询策略

- 迁移状态：读取 `maintenance.get_migration_state()` — 内存中的 MigrationState 对象，零成本，返回 in_progress + source_id + target_id + started_at
- 节点任务：`SELECT install_task.*, cluster.name FROM install_task LEFT JOIN cluster ON install_task.cluster_id = cluster.id WHERE install_task.status IN ('running', 'pending')` — JOIN Cluster 获取集群名称，简单查询无需索引优化
- cluster_name 为 null 时（集群已删除）显示"已删除"

### D4: MigrationState 改造

将 `maintenance.py` 中的 `threading.Event` 替换为 `MigrationState` dataclass：

```python
@dataclasses.dataclass
class MigrationState:
    in_progress: bool = False
    source_id: str | None = None
    target_id: str | None = None
    started_at: datetime | None = None
```

- `set_migration_in_progress(on, source_id=None, target_id=None)` — on=True 时记录 source/target/started_at，on=False 时全部清零
- `get_migration_state()` → `MigrationState` — 返回当前状态对象
- `migration_in_progress()` 保留向后兼容（读 `.in_progress`）
- 不需要 DB 持久化 — 重启自动清零（同 recover_interrupted_tasks 逻辑）

**选择理由**：改动最小（仅 maintenance.py + database.py 迁移端点），无需 DB migration，迁移锁本身就是瞬态的。

### D5: task_type 中文映射

前端维护映射表（复用 node-task-center 已有的 taskTypeLabels），后端只返回原始英文 type。映射示例：

```typescript
const TASK_TYPE_LABELS: Record<string, string> = {
  install: '安装',
  start: '启动',
  stop: '停止',
  distribute_file: '分发文件',
  cmd_exec: '执行命令',
  script_exec: '执行脚本',
}
```

## Risks / Trade-offs

- **[轮询开销]** → 前端仅在页面加载时拉取一次 + 手动刷新，不做轮询，无性能风险
- **[状态延迟]** → 迁移锁的 set/clear 是即时操作，节点任务状态基于 DB 查询，用户手动刷新即可获取最新状态，可接受
- **[新端点权限]** → 复用 `require_db_admin('database_management')` 权限守卫，与现有数据库管理端点一致
- **[cluster_name 性能]** → JOIN 查询，running+pending 任务数量极少（通常 0-3 个），无需索引优化
- **[MigrationState 并发]** → 单线程 asyncio，无并发写入问题；threading.Event 换为 dataclass 不影响线程安全性（迁移本身在单个 async 请求内同步执行）
