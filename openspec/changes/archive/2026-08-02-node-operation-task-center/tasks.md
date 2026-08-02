# node-operation-task-center — Tasks

## 1. 数据库模型

- [x] 1.1 在 `backend/app/models/` 新建 `node_task.py`：定义 `NodeTask`（install_task 表）——id/cluster_id/task_type/status/params(JSON)/total_nodes/success_nodes/failed_nodes/cancelled_nodes/created_by/created_at/started_at/finished_at；**cluster_id 不建 FK（V5）**
- [x] 1.2 同文件定义 `NodeTaskItem`（install_task_node 表）——id/task_id(FK, `ondelete="CASCADE"`)/node_id/**ip 快照**/**node_name 快照**/status/rc/logs(JSON)/stdout/stderr/command/started_at/finished_at；**node_id 为普通 int 列，不做 FK（V4）**——防节点删除级联删任务子项
- [x] 1.3 在 `models/__init__.py` 导出两个模型；确认 `init_db` 建表逻辑自动包含新表（跑一次后端测试验证建表；Postgres FK 约束依赖 create_all 新建表，SQLite 无法 ALTER ADD CONSTRAINT）

## 2. feature 开关

- [x] 2.1 `backend/app/core/features.py` KNOWN_FEATURES 新增 `task_center`
- [x] 2.2 `backend/features.yaml` features 下新增 `task_center: true`
- [x] 2.3 `backend/tests/test_features.py` 补 `task_center` 识别用例（对齐现有 ssl_cert/dns_proxy 用例风格）

## 3. ansible_service.py 增强（共享实例统一 + 取消/进度回调）

- [x] 3.1 **统一实例化（V1/V6）**：将 4 处 `AnsibleRunnerService()`（cluster_nodes:68、cluster_install:38、cluster_edge_env:26、cluster_stream_proxies:247 每请求新建）统一为模块级单例模式；`cluster_stream_proxies.py` 改为复用单例（修复每请求新建绕过信号量的 bug）；确认所有调用方共享同一信号量
- [x] 3.2 `run_playbook` 新增可选 `cancel_event: asyncio.Event | None` 参数（V2）：包装为 `ansible_runner.run` 的 `cancel_callback`（`cancel_callback = lambda: cancel_event.is_set()`，线程内轮询 + SIGKILL 进程组）——**不得用 wait_for/to_thread 取消**（线程池里的 playbook 杀不掉）
- [x] 3.3 `run_playbook` 新增可选 `on_progress: Callable[[dict], None] | None` 回调（event_handler 转发），供任务引擎收集逐行日志
- [x] 3.4 **进程注册表双索引（V3）**：保留 `_install_proc_registry: dict[node_id, Process]`（cancel-install 端点 :315 按 node_id 直查行为不变）；新增任务维度反向索引 `_task_procs: dict[task_id, dict[node_id, Process]]`；完成/GeneratorExit 时按 node_id 从两处索引都 pop（node 粒度清理不误删同任务其他节点）

## 4. 任务执行引擎 node_task_service.py

- [x] 4.1 新建 `backend/app/services/node_task_service.py`：`NodeTaskService` 类——**持有共享的 `AnsibleRunnerService` 单例**（注入现有实例，信号量即其 `self._semaphore`，V1）、`_node_locks: dict[int, asyncio.Lock]`、`_cancel_flags: dict[int, asyncio.Event]`、`_running: dict[int, asyncio.Task]`（强引用防 GC）
- [x] 4.2 实现 `create_task(task_type, cluster_id, node_ids, params) -> NodeTask`：校验节点存在、写主任务（pending）+ 节点子任务（pending）+ 参数快照 + 启动后台执行
- [x] 4.3 实现 `_execute(task_id)` 状态机：pending→running；逐节点驱动（每个子任务获取共享信号量 + per-node 锁）；完成后更新主任务统计；终态 success/failed/partial/cancelled
- [x] 4.4 实现 `_execute_node(item)`：按 task_type 分发到现有执行逻辑——install_openresty（两阶段：`install_openresty_copy` + SSH `install-edge.sh`）、install_edge、associate_new_openresty、edge_pack_add、edge_pack_rebase、start/stop/reload/check（nginx_cmd_run）、statistic（edge_statistic）、edge_env_deploy（edge_init_env + ConfigVersion 创建）
- [x] 4.5 实现 `cancel_task(task_id)`（V2）：置 cancel event；进行中子任务终止——ansible 阶段经 `run_playbook` 的 `cancel_event`（cancel_callback SIGKILL），SSH 阶段经 `_task_procs` kill；未开始标 skipped；主任务 cancelled/partial；幂等
- [x] 4.6 实现 `retry_task(task_id, node_ids=None)`：失败/取消子任务重置 pending 重新执行；成功节点默认跳过
- [x] 4.7 实现日志落库策略：每节点日志逐行追加 logs JSON，每节点 500 行截断；状态变化即时持久化
- [x] 4.8 实现重启恢复：`startup` 时扫描 running/pending 任务标记为 failed（带"进程重启中断"标记）；`shutdown` 时取消所有运行中任务（防 DB 已关闭任务还在跑）
- [x] 4.9 实例化为模块级单例（对齐 `_ansible_service` 模式），并在 `app/main.py` 或 database 初始化处接入 startup

## 5. 任务化 API

- [x] 5.1 新建 `backend/app/api/v1/node_tasks.py`：`POST /clusters/{cluster_id}/node-tasks`（创建，含 task_type/node_ids/params 校验）
- [x] 5.2 `GET /clusters/{cluster_id}/node-tasks`（集群内列表，分页/状态/类型筛选）
- [x] 5.3 `GET /node-tasks`（全局列表，跨集群）
- [x] 5.4 `GET /node-tasks/{task_id}`（详情含节点子任务）
- [x] 5.5 `POST /node-tasks/{task_id}/cancel`（幂等取消）
- [x] 5.6 `POST /node-tasks/{task_id}/retry`（可选 node_ids）
- [x] 5.7 `GET /node-tasks/{task_id}/stream`（SSE：task_update/node_update/log_line/done 事件）
- [x] 5.8 在 `api/v1/__init__.py` 注册 `"task_center": node_tasks.router`；`main.py` feature 门控自动生效（对齐现有 feature_routers 模式）

## 6. 后端测试

- [x] 6.1 `tests/test_node_task_model.py`：模型建表 + CRUD（主任务/子任务/快照字段）
- [x] 6.2 `tests/test_node_task_service.py`：状态机（pending→running→success/failed/partial）、per-node 互斥、cancel 跳过未开始节点、retry 重置失败节点
- [x] 6.3 `tests/test_node_task_api.py`：创建/列表/详情/取消/重试端点（mock `NodeTaskService` 或内存执行）
- [x] 6.4 确认 `tests/test_node_batch_action.py` 等现有测试不受影响（双轨并存）
- [x] 6.5 `tests/test_features.py`：task_center 开关用例（见 2.3）

## 7. 前端 useNodeTasks composable

- [x] 7.1 新建 `frontend/src/composables/useNodeTasks.ts`：任务 API 封装（create/list/get/cancel/retry）
- [x] 7.2 同文件实现 SSE 消费（V8）：`useTaskStream(taskId)`——**自写 parser** 解析 `data: {type, task_id, node_id, status, progress, line}` 事件（**不复用 useInstallStream**：其单实例单流、无重连、parser 只认 `{line,percent,rc}` 格式不兼容）；断线 3 秒重连；不支持的浏览器 fallback 5 秒轮询
- [x] 7.3 抽取纯日志组件（V9）：从 NodeExecutionResultDrawer 抽出 **tabs 壳 + stdout/stderr/command + ansiToHtml + 自动滚动 + copyAll**；**summary tab 的节点域逻辑**（`title.startsWith('安装')`、nginxStatus、statLabels、statistics 网格）**保留在原组件**，不随抽取迁移

## 8. 前端任务中心页面

- [x] 8.1 新建 `frontend/src/views/NodeTaskCenter.vue`：PageHeader + 过滤器（类型/状态/集群/时间）+ a-table（任务类型、状态 tag、节点数、进度条、创建时间、操作列）
- [x] 8.2 任务详情抽屉：主任务信息 + 逐节点子任务表（IP/状态/耗时/日志展开）+ 取消/重试按钮
- [x] 8.3 `router/index.ts`（V7）：featureRouteMap 注册 `task_center` → **`{ path: 'node-tasks', name: 'NodeTaskCenter', component: () => import('@/views/NodeTaskCenter.vue') }`（无前导斜杠，Layout 子路由）**；coreRoutes 无需改
- [x] 8.4 `AppSidebar.vue`：「运维管理」新增「节点任务」菜单项（`feature: 'task_center'`，对齐 edge_client/edge_import/tools 模式）+ `isActive()` 加 `if (item.route === '/node-tasks') return name === 'NodeTaskCenter'` case

## 9. 前端入口集成（双轨并存）

- [x] 9.1 `NodeTaskCenter.vue`：新增「新建任务」按钮 + 弹窗（选集群 → 勾选节点 → 选操作类型）；**参数从节点记录自动读取，不手动填写**（需求确认）；现有单节点 SSE 流程不动
- [x] 9.2 **移除** `ClusterNodes.vue` 的「任务化操作」下拉与 `NodeList.vue` 的行内「创建启动任务」入口——创建任务统一集中在节点任务页（需求确认）
- [x] 9.3 EdgePackManagementDialog 事件桥两个监听者（NodeList L997、ClusterNodes L984）保持现状（任务化升级通过任务中心创建）
- [x] 9.4 `useClusterNodes.ts` 的 `batchNodeAction`/`batchNodeStatus` 保留现状（前端并发编排），文档标注任务化为新增通道
- [x] 9.5 实现 `NodeTaskService._execute_node` 生产 executor（按 task_type 分发到 ansible 方法，参数从节点记录推导：prefix=node.edge_install_path、ports=management_port 等）——修复 `NotImplementedError` 隐患

## 10. 验证与文档

- [x] 10.1 运行后端测试：`cd backend && uv run pytest tests/test_node_task_* tests/test_features.py`（全绿）
- [x] 10.2 运行前端测试：`cd frontend && npx vitest run`（全绿，含现有 useClusterNodes/features 测试回归）
- [x] 10.3 `lsp_diagnostics` + `vue-tsc --noEmit` 检查所有修改文件无 error
- [x] 10.4 `docs/` 新增任务中心说明：任务类型表、状态机、并发/互斥语义、双轨并存说明、task_center 开关
- [x] 10.5 更新 `docs/design/features-config.md`：features.yaml 示例加 `task_center`
- [x] 10.6 运行 `openspec validate node-operation-task-center` 通过
