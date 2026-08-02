# node-operation-task-center — Design

## Context

节点管理中走 ansible/SSH 的操作目前是**无状态、无持久、无统一视图**的。基于代码勘察确认：

- **12 类操作**：install-openresty（两阶段：ansible `install_openresty_copy` + 直连 SSH `install-edge.sh`）、install-edge、associate-new-openresty（tag `upgrade_openresty`）、edge-pack-add、edge-pack-rebase、start/stop/reload/check（tag `nginx_cmd_run`）、statistic（tag `edge_statistic`）、edge-env deploy（tag `edge_init_env`）、edge-env read（tag `edge_read_env`）。
- **执行入口**：`AnsibleRunnerService.run_playbook`（ansible_service.py:335，全局 `asyncio.Semaphore(get_concurrency("max_playbooks", 5))` 在 :329/:392）+ install-openresty 阶段 2 的直连 SSH（`_build_ssh_cmd`）。
- **现有取消**：仅 install-openresty 有 `_install_proc_registry`（内存 dict，node_id → SSH subprocess）+ `cancel-install` 端点。
- **现有持久化**：`node.status_detail`（nginx_cmd/statistic 类即时结果）+ `ConfigVersion`（edge.env deploy）。**无任务表**。
- **前端**：NodeList.vue（全局页）与 ClusterNodes.vue（集群 Tab，托管于 CentralList.vue）两处高度重复的操作逻辑；SSE 走 `useInstallStream`（fetch + ReadableStream）；批量走 `runWithConcurrency`（并发 = min(batch_action, max_playbooks)）；EdgePackManagementDialog 通过 CustomEvent 桥接。

目标：统一建模为可持久化的异步任务，全局任务中心可查/可取消/可重试，与现有单节点 SSE 流程双轨并存。

## Goals / Non-Goals

**Goals:**
- 所有 ansible 类节点操作可持久化执行：任务状态、逐节点进度、日志、结果落库，可追溯历史
- 全局任务中心：跨集群任务列表 + 详情（逐节点 + 日志）+ 取消/重试
- 后端统一执行引擎：并发受 `max_playbooks` 约束 + per-node 互斥（同节点不同时跑多个操作）
- 双轨并存：现有单节点 SSE 入口与交互（InstallOpenrestyDialog / NodeExecutionResultDrawer）保留；任务化为新增入口
- 新 `task_center` feature 开关控制路由/菜单显隐

**Non-Goals:**
- 不替换现有单节点 SSE 交互（保留双轨；后续可再议是否收敛）
- 不做通用任务编排平台（如定时任务、依赖 DAG）——只做"节点操作任务"这一种任务类型（含多节点子任务）
- 不做任务执行节点的横向扩展（单后端进程内调度，与现状多 worker 共享信号量语义一致）
- 不引入 Celery/RQ 等外部任务队列——用 asyncio 后台任务 + DB 持久化即可满足

## Decisions

### D1: 任务数据模型 — 主任务 + 节点子任务两表

```python
class NodeTask(Base):
    __tablename__ = "install_task"
    id: int PK
    cluster_id: int             # 不建 FK（V5：任务历史跨集群保留，集群删除后任务不随删）
    task_type: str              # install_openresty / install_edge / associate_new_openresty /
                                # edge_pack_add / edge_pack_rebase / start / stop / reload /
                                # check / statistic / edge_env_deploy
    status: str                 # pending / running / success / failed / cancelled / partial
    params: JSON                # 参数快照（openresty_file / prefix / version / edge_target / env_content ...）
    total_nodes: int
    success_nodes: int
    failed_nodes: int
    cancelled_nodes: int
    created_by: int | None      # 用户 id（可选）
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

class NodeTaskItem(Base):
    __tablename__ = "install_task_node"
    id: int PK
    task_id: int FK -> install_task.id (ondelete="CASCADE")  # 删任务连删子项（取消/重试语义）
    node_id: int                # 普通 int 列，不做 FK（V4：防节点删除级联删任务子项，破坏快照）
    ip: str                     # 快照，防节点删除后丢失
    node_name: str | None       # 快照
    status: str                 # pending / running / success / failed / cancelled / skipped
    rc: int | None
    logs: JSON                  # 逐行日志（[{t, level, line}]，可追加）
    stdout: str | None
    stderr: str | None
    command: str | None
    started_at: datetime | None
    finished_at: datetime | None
```

- **快照原则**：`ip`/`node_name` 冗余存储，节点被删/改名后任务历史仍可读。`params` 存任务创建时的完整参数，重试/追溯不依赖节点当前状态。
- **FK 策略（V4/V5）**：`NodeTaskItem.node_id` **不做 FK**（普通 int 列，与 ip 快照原则一致）——全项目 FK 惯例是 `ondelete="CASCADE"`，若照惯例建 FK，删除节点（cluster_nodes.py `db.delete(node)`）会级联删任务子项，直接破坏快照需求。`NodeTaskItem.task_id → install_task.id` 建 `ondelete="CASCADE"`（删任务连删子项，符合取消/重试语义）。`NodeTask.cluster_id` **不建 FK**——任务中心是跨集群全局视图，集群删除（clusters.py:316-361 手写级联清单，新表不自动纳入）后任务历史保留。
- **日志策略**：逐行追加到 `logs` JSON（上限控制，如每节点 500 行截断，防 DB 膨胀）；`stdout`/`stderr` 与 `logs` 的关系：logs 是结构化逐行流（SSE 用），stdout/stderr 是最终结果汇总（详情用）。
- **partial 状态**：多节点任务部分成功部分失败时主任务为 `partial`（非简单 failed），语义清晰。
- **迁移**：走现有 SQLAlchemy 建表机制（`init_db` 建表），生产 PostgreSQL 无额外工具。

### D2: 执行引擎 — asyncio 后台任务 + 信号量 + per-node 锁

```python
class NodeTaskService:
    _ansible: AnsibleRunnerService   # 共享实例（V1：复用现有 _ansible_service，非新建）
    _node_locks: dict[int, asyncio.Lock]  # per-node 互斥锁（node_id → Lock）
    _cancel_flags: dict[int, asyncio.Event]  # task_id → cancel event
    _running: dict[int, asyncio.Task]  # task_id → 后台任务句柄（强引用防 GC，V 见下）

    async def create_task(...) -> NodeTask      # 建任务（pending）→ 返回
    async def start_task(task_id)               # 后台 asyncio.create_task 执行
    async def _execute(task_id)                 # 状态机驱动
    async def _execute_node(item)               # 单节点子任务（ansible 或 SSH）
    async def cancel_task(task_id)              # 置 cancel event → 引擎终止未完成节点
```

- **信号量共享（V1）**：`NodeTaskService` **持有并复用现有 `AnsibleRunnerService` 实例**（注入 `cluster_install._ansible_service` 或 `cluster_nodes._ansible_service` 的模块级单例），信号量是其实例属性（ansible_service.py:329）。**不新建实例**——否则得到第 5 把满容量锁，并发上限被绕过。现状 4 处实例化（cluster_nodes:68、cluster_install:38、cluster_edge_env:26、cluster_stream_proxies:247 每请求新建）**统一为模块级单例模式（V6）**，顺带修复 stream_proxies 每请求新建绕过信号量的现存 bug。每 worker 进程一把锁的语义在统一后真正成立。
- **状态机**：
  ```
  主任务: pending → running → success | failed | cancelled | partial
  子任务: pending → running → success | failed | cancelled | skipped
  ```
  - `skipped`：cancel 触发时，尚未开始的子任务直接标 skipped（不执行）
  - `partial`：有 success 也有 failed/cancelled
- **并发控制**：全局 `_semaphore`（即共享实例的信号量，同 `max_playbooks`，跨所有任务 + 同步操作共享）；**每个运行中的子任务获取一次信号量**。
- **per-node 互斥（D 关键新增）**：`_node_locks[node_id]` 保证同一节点同一时刻只跑一个任务子项。现状是"同一节点可同时被 start 和 statistic 打"（无锁），任务化后互斥，杜绝并发操作同节点导致的状态错乱。同步单节点操作（双轨）不强制走锁（保留现状），但任务内部严格互斥。
- **取消机制（V2，泛化）**：`_cancel_flags[task_id].set()` → 引擎检查：
  - 阶段 1（ansible）：`run_playbook` 新增 `cancel_event: asyncio.Event | None` 参数，包装为 `ansible_runner.run` 的 **`cancel_callback`**（`cancel_callback = lambda: cancel_event.is_set()`）。ansible_runner 默认 pexpect 模式主循环每轮轮询 cancel_callback（runner.py:323），返回 True 则 `handle_termination(child.pid)` 对整个进程组发 **SIGKILL**（runner.py:536-553）——这是**唯一可行**的 playbook 终止通道。⚠️ `asyncio.wait_for(asyncio.to_thread(...))` 取消不了线程池里的 playbook（ansible_service.py:392-401），必须走 cancel_callback。
  - 阶段 2（SSH 编译）：kill SSH 子进程（复用现有机制）。
  - 未开始的子任务标 skipped；进行中的等当前子任务被取消后停止
- **进程注册表（V3，双索引）**：保留现有 `_install_proc_registry: dict[node_id, Process]`（cluster_install.py:96，cancel-install 端点 :315 按 node_id 直查，**行为不变**）；新增任务维度反向索引 `_task_procs: dict[task_id, dict[node_id, Process]]`。完成/GeneratorExit 时按 node_id 从两处索引都 pop（node 粒度清理不误删同任务其他节点条目）。
- **持久化时机**：每次状态变化 + 每 N 条日志（或每 2 秒）落库，防崩溃丢进度；重启后 `pending`/`running` 的任务恢复为 `failed`（带"进程重启中断"标记）或支持手动重试。
- **后台任务生命周期**：`_running` dict 持 `asyncio.Task` **强引用**——asyncio 对 Task 只持弱引用，无强引用运行中任务可能被 GC（"Task was destroyed but it is pending"）；任务结束时 `pop`。`create_task` 调度在事件循环上，与发起它的 HTTP 请求协程独立，请求返回不取消任务。**lifespan shutdown 时取消所有运行中任务**（防 DB 已关闭任务还在跑），状态置 failed。

### D3: 任务化 API

```
POST   /clusters/{cluster_id}/node-tasks          创建任务（cluster 维度）
GET    /clusters/{cluster_id}/node-tasks          集群内任务列表
GET    /node-tasks                                全局任务列表（跨集群，分页/筛选）
GET    /node-tasks/{task_id}                      任务详情（含节点子任务）
POST   /node-tasks/{task_id}/cancel               取消
POST   /node-tasks/{task_id}/retry                重试失败/取消节点（body: node_ids? 可选限定）
GET    /node-tasks/{task_id}/stream               SSE 任务实时事件（可选；前端可用轮询兜底）
```

- **创建请求体**（示例）：
  ```json
  {
    "task_type": "install_openresty",
    "node_ids": [1, 2, 3],
    "params": { "openresty_file": "openresty-1.25.3.1.tar.gz", "prefix": "/data/openresty" }
  }
  ```
  - `prefix` 缺省时逐节点取 `node.edge_install_path`（与现有 install-openresty 语义一致）
  - `edge_pack_rebase` 需 `version`；`edge_env_deploy` 需 `env_content`
- **SSE 事件格式**：`data: {"type":"node_update","task_id":1,"node_id":5,"status":"running","progress":40,"line":"..."}`；`type` 含 `task_update` / `node_update` / `log_line` / `done`。前端据此刷新逐节点状态行与日志。
- **取消语义**：`cancel` 幂等；已 success 节点保留结果，未完成节点 cancelled，未开始 skipped。

### D4: 双轨并存 — 任务化入口与现有单节点 SSE 并行

- **保留**：NodeList.vue / ClusterNodes.vue 现有单节点按钮与 SSE 交互（InstallOpenrestyDialog、NodeExecutionResultDrawer、useInstallStream、cancel-install）**不改行为**。
- **新增入口（V10）**：
  1. ClusterNodes.vue 工具栏新增「任务化操作」下拉/按钮：勾选 N 个节点 + 选操作类型 + 填参数 → 创建任务 → 跳转/弹出任务详情（复用 BatchActionProgressModal 视觉风格扩展为任务模式）
  2. NodeList.vue 行内菜单新增「创建任务」入口（**NodeList 无批量区**，仅行内）
  3. 侧边栏「运维管理」新增「节点任务」菜单 → `/node-tasks` 全局任务中心
- **批量操作迁移策略**：`batchNodeAction`/`batchNodeStatus` 保留现状（前端 runWithConcurrency）；任务化为**新增并行通道**，不强制迁移。文档说明两者差异（即时 vs 持久）。
- **EdgePackManagementDialog 事件桥**：任务化改造时两个监听者（NodeList L997、ClusterNodes L984）同步处理，新增"转为任务"分支。

### D5: 前端任务中心页面 `/node-tasks`

- **列表**（骨架参考 NodeList.vue）：PageHeader + 过滤器（任务类型/状态/集群/时间）+ a-table（任务类型、状态 tag、节点数、进度条、创建时间、操作列：详情/取消/重试）
- **详情抽屉**：主任务信息 + 逐节点子任务表（IP、状态、耗时、日志展开行）+ 操作（取消全部/重试失败）
- **实时刷新（V8）**：`useNodeTasks.ts` **独立实现** SSE 消费——自写 parser（适配 D3 事件格式 `{type, task_id, node_id, status, progress, line}`，**不能复用** useInstallStream：其单实例单流、无重连、parser 只认 `{line, percent, rc}` 三个字段，与任务事件格式不兼容）+ **断线 3 秒重连**（现状 useInstallStream 无任何重连逻辑）+ 不支持的浏览器 fallback 5 秒轮询 `GET /node-tasks/{id}`。每个任务一个流实例（useInstallStream 每次 start 覆盖同一 abortController，单实例无法并发多流）。
- **日志展示（V9）**：从 NodeExecutionResultDrawer 抽取**纯日志组件**（tabs 壳 + stdout/stderr/command + ansiToHtml + 自动滚动 + copyAll）；summary tab 的节点域逻辑（`title.startsWith('安装')`、nginxStatus、statLabels、statistics 网格）**保留在 NodeExecutionResultDrawer 原组件**，不随抽取迁移。
- **入口挂载（V10）**：批量任务化入口在 **ClusterNodes.vue 工具栏**（复用 `batchCount > 0` 双模式判断 + `selectedNodeKeys` 作为任务节点源）；**NodeList.vue 无批量区**（无 row-selection），仅挂行内菜单。BatchActionProgressModal 可扩展（给 `BatchNodeProgressItem` 加可选字段 + 新增 retry/cancel emits），但任务模式需要的进度条/操作行是新能力，若改动面大则新建任务详情组件（复用其 statusIcon/statusText 视觉风格）。
- **路由/菜单（V7）**：`featureRouteMap` 注册 `task_center` → **`path: 'node-tasks'`（无前导斜杠，Layout 子路由，`router.addRoute('Layout', route)`）**，`name: 'NodeTaskCenter'`；AppSidebar「运维管理」加菜单项 `feature: 'task_center'`（对齐 edge_client/edge_import/tools 门控模式）+ `isActive()` 加 `if (item.route === '/node-tasks') return name === 'NodeTaskCenter'` case。

### D6: feature 开关与并发配置

- `features.py` KNOWN_FEATURES 加 `task_center`（默认 true，opt-out 模型对齐现有）；`features.yaml` 加 `task_center: true`；`api/v1/__init__.py` `feature_routers` 注册 `"task_center": node_tasks.router`，main.py feature 门控自动生效
- 任务并发复用**共享实例**的信号量 `get_concurrency("max_playbooks", 5)`（V1）；**不新增**独立安装并发配置（任务引擎信号量天然限制全局 ansible 并发，避免与同步操作冲突——设计权衡：任务和同步操作共享 max_playbooks 槽位，安装长任务会挤占短操作，但这是现状语义的延续，文档提示即可）
- **权限（V11）**：任务端点**不加鉴权**——对齐现状节点操作端点（cluster_nodes.py:345-431、cluster_install.py 全部仅 `Depends(get_db)`，无 `Depends(get_current_user)`）。保持内网运维工具定位；若日后要补，照 `routes.py:35` 的 `Depends(get_current_user)` 模式即可。

## Risks / Trade-offs

- **任务与同步操作共享 max_playbooks 槽位** → 安装长任务会阻塞短操作排队。缓解：文档说明；后续可考虑按操作类型分信号量（本次不做）。
- **信号量共享依赖实例统一（V1/V6）** → 若实例化统一不彻底，仍有调用方各自新建实例绕过锁。缓解：统一 4 处实例化为模块级单例（含修复 stream_proxies 每请求新建 bug），NodeTaskService 显式注入共享实例；测试断言所有调用方用同一实例。
- **per-node 锁仅任务内部生效** → 同步单节点操作（双轨）仍可能与任务并发操作同节点。缓解：文档标注"任务化操作与同步操作对同一节点的并发不受保护"；后续若收敛双轨再统一。
- **cancel_callback 依赖 ansible_runner pexpect 模式（V2）** → 若 runner_mode 变更（如 process-isolation），cancel 通道失效。缓解：保留 `settings.job_timeout` 内部超时兜底（runner.py:333-335 同样走 handle_termination 杀进程组）；实现时验证 pexpect 模式。
- **日志落库膨胀** → 逐行日志 JSON 存 DB。缓解：每节点 500 行截断 + 只保留最近任务（可选清理策略，本次仅截断）。
- **进程重启丢运行中任务** → 重启后 running/pending 标记 failed（带标记），提供重试；lifespan shutdown 取消运行中任务。缓解：状态机处理 + `retry` API + `_running` 强引用防 GC。
- **SSE 与轮询** → useNodeTasks 独立实现断线重连 + fallback 轮询（V8），前端容错。
- **DB 迁移** → 新增 2 表走 init_db 建表（补 models/__init__.py import），无破坏性变更；Postgres 新增 FK 约束只能靠 create_all 新建表（SQLite 无法 ALTER TABLE ADD CONSTRAINT，migrate.py:256-268）。
- **FK 策略（V4/V5）** → node_id 无 FK + cluster_id 无 FK，删节点/集群后任务历史保留（快照可读）；task_id→task CASCADE 保证取消/重试语义下子项清理干净。代价：无 DB 级引用完整性，需应用层校验 node_id 存在性（创建任务时）。
- **双轨并存增加维护面** → 两套入口逻辑共存。缓解：任务化入口包装函数集中（`useNodeTasks.ts`），现状入口不改，明确边界。

## Migration Plan

1. `models/` 新增 `NodeTask` + `NodeTaskItem`（node_id/cluster_id 无 FK，task_id→task CASCADE）；`models/__init__.py` 补 import；`init_db` 建表（后端测试先跑通）
2. `features.py` 加 `task_center`；`features.yaml` 更新；`api/v1/__init__.py` feature_routers 注册
3. **统一实例化（V1/V6）**：4 处 `AnsibleRunnerService()` 统一为模块级单例（含修复 cluster_stream_proxies.py:247 每请求新建）；确认共享信号量
4. `ansible_service.py`：`run_playbook` 新增 `cancel_event` 参数（包装为 `ansible_runner` 的 `cancel_callback`，V2）+ `on_progress` 回调；`_install_proc_registry` 保持 node 主索引 + 新增任务反向索引（V3）
5. `services/node_task_service.py`：执行引擎（状态机 + 共享信号量 + per-node 锁 + cancel_callback 取消 + 重试）
6. `api/v1/node_tasks.py`：7 个端点（无鉴权，V11）+ feature 门控注册
7. 前端 `useNodeTasks.ts`（独立 SSE parser + 重连，V8）+ 抽日志组件（V9）+ `NodeTaskCenter.vue` + 路由（`path: 'node-tasks'`，V7）/菜单
8. ClusterNodes.vue 工具栏 + NodeList.vue 行内菜单任务化入口（V10，新增，不动现有）
9. 文档更新
10. **回滚**：`task_center: false` 即隐藏入口（路由/菜单消失，表与 API 保留但无人调用）；代码层无破坏性变更

## Open Questions

- `edge_env_deploy`（edge.env 批量部署）是否纳入本变更首批任务类型？proposal 标注为"相邻能力可选"。倾向纳入（它已是批量节点流式操作，任务化收益直接），但确认范围。
- 任务创建是否需要权限控制（仅 admin）？倾向与现有节点操作权限一致（无额外限制），待确认。
- 全局任务中心菜单挂载位置：「运维管理」（Edge直连/数据导入/工具箱）还是「核心功能」？倾向「运维管理」。
