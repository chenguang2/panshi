# node-operation-task-center

## Why

节点管理中所有走 ansible/SSH 的运维操作（安装 OpenResty、安装 Edge、关联新 OpenResty、升级 Edge 小版本、启动/停止/reload/状态查询、批量操作、edge.env 部署）目前**零落库、零历史、零统一视图**：进度全靠一次性 SSE 流（刷新即丢）、取消仅 install-openresty 支持、结果只有 `node.status_detail`（nginx_cmd/statistic 类）和 `ConfigVersion`（edge.env）两处零散持久化，没有任务表、没有全局任务列表、失败后无法追溯或重试。多节点安装/升级场景下，运维人员无法知道"刚才那批节点装到哪了、哪些成功哪些失败"。

需要建立**节点操作任务中心**：所有 ansible 类节点操作统一建模为可持久化的异步任务（落库、可查询、可取消、可重试、可追溯历史），并提供全局任务中心页面。

## What Changes

- **新建任务持久化模型**：`install_task`（主任务） + `install_task_node`（节点子任务）两张表（SQLite/PostgreSQL），记录任务类型、状态机、参数快照、逐节点进度、日志、结果、耗时、创建人、取消标记。**BREAKING**: 新增 DB 表，需要迁移。FK 策略：`task_id→task` 建 `ondelete="CASCADE"`（删任务连删子项）；`node_id`/`cluster_id` **不建 FK**（任务历史跨节点/集群删除保留，快照可读）。
- **后端任务执行引擎**：`NodeTaskService` 后台任务执行器——**共享现有 `AnsibleRunnerService` 实例的信号量**（非新建实例避免并发上限被绕过；现状 4 处实例化统一为模块级单例）+ per-node 互斥锁（同一节点同时只允许一个操作）；任务状态机：`pending → running → success | failed | cancelled | partial`；节点子任务 `pending → running → success | failed | skipped`。
- **任务化 API**：
  - `POST /clusters/{id}/node-tasks` — 创建任务（body: 操作类型 + 节点列表 + 参数快照，如 openresty_file/prefix/version）
  - `GET /clusters/{id}/node-tasks` — 任务列表（分页/筛选/集群维度）
  - `GET /node-tasks` — 全局任务列表（跨集群，任务中心页）
  - `GET /node-tasks/{task_id}` — 任务详情（含逐节点状态 + 日志）
  - `POST /node-tasks/{task_id}/cancel` — 取消任务（终止未完成节点，已完成的保留结果）
  - `POST /node-tasks/{task_id}/retry` — 重试失败节点（可选：重跑指定节点）
  - `GET /node-tasks/{task_id}/stream` — 任务执行过程的 SSE 推送（前端实时刷新，可选 fallback 轮询）
- **覆盖的操作类型**（对齐现有 12 类 ansible 触达点）：
  - 安装类：`install_openresty`（含 SSH 编译阶段）、`install_edge`、`associate_new_openresty`、`edge_pack_add`、`edge_pack_rebase`
  - 运维类：`start`、`stop`、`reload`、`check`、`statistic`（状态查询）
  - 批量类：上述运维类操作的多节点批量（后端任务化，替代前端 `runWithConcurrency` 编排）
  - 环境类：`edge_env_deploy`（可选纳入，作为相邻能力）
- **前端全局任务中心页面** `/node-tasks`：任务列表（类型/状态/节点数/进度/创建时间/操作）+ 任务详情抽屉（逐节点状态行 + 可展开日志 + 取消/重试按钮）。侧边栏「运维管理」或「核心功能」新增入口。
- **双轨并存**：现有单节点 SSE 流程（InstallOpenrestyDialog + NodeExecutionResultDrawer + useInstallStream）**保留不动**；新增任务化入口与现有入口并行（旧入口=实时交互，新入口=任务化持久）。批量操作（`batchNodeAction`/`batchNodeStatus`）逐步迁移到任务化。
- **并发与互斥**：任务引擎共享 `get_concurrency("max_playbooks", 5)` 信号量（V1）；新增 per-node 互斥（同节点并发操作拒绝或排队），解决现状"同一节点可同时跑多个操作"的隐患。
- **取消机制扩展**：`run_playbook` 新增 `cancel_event` 参数，包装为 `ansible_runner` 的 **`cancel_callback`**（线程内轮询 + SIGKILL 进程组——`wait_for`/`to_thread` 结构杀不掉后台 playbook，V2）；`_install_proc_registry` 保留 node 主索引（cancel-install 行为不变）+ 新增任务反向索引（V3），SSH 子进程 + ansible-runner 进程都可终止。
- **前端任务化入口（V10）**：批量任务化入口在 ClusterNodes.vue 工具栏（复用 `batchCount` 双模式 + `selectedNodeKeys`）；NodeList.vue 无批量区，仅行内菜单入口。
- **任务 SSE（V8）**：`useNodeTasks` 独立实现（自写 parser 适配任务事件格式 + 断线重连），不复用 useInstallStream（单实例单流、无重连、parser 格式不兼容）。

## Capabilities

### New Capabilities

- `node-task-center`: 节点操作任务化的完整能力——任务持久化模型、执行引擎、任务 CRUD/取消/重试 API、全局任务中心页面、双轨并存的入口集成。

### Modified Capabilities

- `node-management`: 节点管理页（NodeList.vue 全局页 + ClusterNodes.vue 集群 Tab）新增任务化入口与任务中心跳转；批量操作从"前端 runWithConcurrency 编排"演进为"后端任务化执行"。
- `edge-node-lifecycle`: start/stop/reload/check/statistic 类节点生命周期操作支持以任务形式执行（后端批量任务化），并与现有同步单节点执行双轨并存。
- `deployment-feature-config`: 新增 `task_center` 功能开关（features.yaml `features.task_center`），控制任务中心路由与菜单显隐（对齐既有 feature 门控模式）。

## Impact

- **代码**：
  - 后端新增：`models/` 任务模型（install_task / install_task_node）、`services/node_task_service.py`（执行引擎）、`api/v1/node_tasks.py`（任务路由）、`api/v1/__init__.py`（注册）
  - 后端修改：`services/ansible_service.py`（run_playbook 支持可取消/进度回调、泛化进程注册表）、`api/v1/cluster_install.py`（`_install_proc_registry` 接入任务引擎）、`features.py`（KNOWN_FEATURES 加 `task_center`）、`main.py`（feature 门控注册）
  - 前端新增：`views/NodeTaskCenter.vue`（全局任务中心页）、`composables/useNodeTasks.ts`（任务 API + SSE 消费）
  - 前端修改：`router/index.ts`（`/node-tasks` 路由 + featureRouteMap）、`AppSidebar.vue`（菜单项 + `isActive()` case）、`NodeList.vue`/`ClusterNodes.vue`（任务化入口包装）、`stores/features.ts`（无改动，自动支持新 feature）
  - `backend/features.yaml`（新增 `task_center: true`）
- **API**：新增 7 个任务端点（见 What Changes）；现有单节点端点（install-openresty 等）**保持不变**（双轨并存）。
- **数据库**：新增 2 张表（install_task / install_task_node），需迁移；`node.status_detail` 继续用于同步单节点操作的即时结果，任务结果写入任务表（两处数据共存，不冲突）。
- **文档**：`docs/` 新增任务中心使用说明（任务类型、状态机、并发/互斥语义、双轨并存说明）。
- **无新外部依赖**：任务引擎基于现有 asyncio + ansible-runner + SQLAlchemy。
