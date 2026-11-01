# node-task-ux-optimization 设计

## 决策

### D1 失败归因 = 分类函数下沉 + 不区分 rc（P0，问题 1）
现状 `_ansible_false_success_error`（`ansible_service.py:265-284`）语义是「假成功守卫」，两处调用都包在 `if rc == 0` 里（`ansible_service.py:1235`、`node_task_service.py:341`），因此**真实失败永不归因**。修法：把它泛化为 `classify_ansible_failure(result, ip) -> str | None`，`_run_item` 在拿到 `result` 后**无条件**调用（rc 任意），命中的中文文案写入新增列 `failure_reason`，并在 `stderr` 为空时回填 `stderr`（既有前端 stderr 页签无需改动即可读到）。
分类表（按命中优先级，全部小写子串匹配合并后的 stdout/stderr/shell_stdout）：

| # | 标记 | 归因文案（模板） |
|---|---|---|
| 1 | `no hosts matched` / `could not match supplied host pattern` | 节点 {ip} 不在 Ansible 主机清单中，请在 inventory/host 文件中添加该节点的 SSH 连接信息 |
| 2 | `permission denied` / `authentication failed` | 节点 {ip} SSH 认证失败，请检查免密登录或清单中的密码 |
| 3 | `unreachable!` / `"unreachable": true` / `failed to connect` / `connection timed out` / `connection refused` | 节点 {ip} 无法连接，请检查网络与 SSH 服务（22 端口） |
| 4 | `timed out` / `timeout` / `exit code 124` | 节点 {ip} 执行超时，请检查命令或调大超时时间 |
| 5 | `no space left` | 节点 {ip} 磁盘空间不足，请清理后重试 |
| 6 | `sudo: command not found` / `must be run as root` / `a password is required` | 节点 {ip} 缺少必要权限，请以 root 或配置 sudo 免密执行 |
| 7 | 其他（rc≠0） | 节点 {ip} 执行失败（返回码 {rc}），请查看日志详情 |

**优先级要点（实现期补充，2026-11-01）**：`authentication failed`/`permission denied` 必须排在
`unreachable` **之前**——ansible 把 SSH 认证失败包在 `UNREACHABLE! => {"msg": "... Permission
denied (publickey,password)", "unreachable": true}` 里，两个标记同时命中；若先判 unreachable，
用户会被引去查网络与 22 端口，而真正要改的是清单里的密码/密钥。同理 `connection timed out`
必须排在通用 `timeout` 之前，否则「连不上」会被误报成「命令跑太久」。两条均有测试钉死
（`test_auth_failure_wins_over_unreachable` / `test_connection_timeout_wins_over_generic_timeout`）。

兜底文案保证「任何失败都至少有一句中文」——这是本决策的核心验收点：**不存在 stderr 与 failure_reason 同时为空的失败子项**。
任务级 `failure_summary`：失败子项 `failure_reason` 去重后按「节点数」聚合，输出形如「3 台节点不在 Ansible 主机清单；1 台 SSH 连接超时」，随列表与详情返回（`_to_task_dict`）。

### D2 统计一致性 = 子项重算 + 启动回填（P0，问题 2）
`total_nodes` 创建时写入后不再更新，`success/failed/cancelled_nodes` 收尾时由 `results` 计数（`node_task_service.py:117、365-367`）——两者会漂移。修法：新增 `_recompute_stats(task, items)`，`total_nodes = len(items)`、`success/failed/skipped/cancelled` 全部 `count` 子项状态，在**创建后、收尾时、重试后**统一调用；`_to_task_dict` 只读该口径。历史数据由启动迁移一次性回填（幂等：以子项实际计数覆盖主表，`total_nodes=count(items)`）。
备选「读取时动态算」被否：列表分页会为每行多查一次子项，N+1 查询；且 SSE `task_update` 需要现值。
前端进度：分段条 + `成功 x · 失败 y · 跳过 z / 共 n`，`success/total` 不再作为唯一进度来源。

### D3 取消通道补齐 = 全类型可取消（P0，问题 3）
spec「所有任务类型可取消」已明确要求。缺口是四处执行器没接 `cancel_event`：

| 执行器 | 现状 | 修法 |
|---|---|---|
| `nginx_cmd`（start/stop/reload/check） | `run_playbook` 未传 cancel | 透传 `cancel_event`（`run_playbook` 已支持 cancel_callback） |
| `statistic` | 同上 | 同上 |
| `software_check`（ansible 腿） | 未传 | 同上 |
| 脚本模式 `cmd_exec`（SSH） | `asyncio.wait_for` 无 kill 通道 | 泛化 `_install_proc_registry`：登记 ssh 进程，cancel 时 SIGTERM 进程组 |

`run_playbook` 的 cancel 回调已是「对进程组 SIGKILL」，直接透传即可，无新机制。
**备选（已否决）**：不动执行器，仅对不支持的类型隐藏「取消」入口并在详情说明「该任务类型执行中不可取消」——需同步改 spec「所有任务类型可取消」。

**裁决（2026-11-01，用户确认）**：采正选——四类执行器全量补齐真取消。其中 `nginx_cmd`/`statistic`/`software_check` 仅需透传 `cancel_event`；脚本模式 SSH 需把 ssh 进程登记进 registry 并支持对进程组 SIGTERM，**必须以实机验证收尾**（test 集群节点 5/6：取消后 `ps` 无残留 ansible/ssh 进程、节点上无残留临时文件）。

### D4 取消状态可见（P0，问题 4）
- `NodeTask` 新增 `cancel_requested_at`（nullable datetime）。`POST /cancel` 置位（已置位则幂等返回），收尾清空与否不加约束（保留供追溯）。
- 子项状态机补 `cancelled`：取消时为**运行中**子项写 `cancelled`（同时 rc 保留终止码），**未开始**子项写 `skipped`。
- 收尾统计 `cancelled_nodes = count("cancelled")`，主任务状态规则不变（全未完成 → cancelled；部分完成 → partial）。
- SSE `task_update` 增加 `cancel_requested` 布尔，前端 chip 显示「取消中」并禁用重复点击。

### D5 重启中断写原因（P0，问题 5）
`recover_interrupted_tasks`（`node_task_service.py:952-962`）除改状态外，写 `failure_reason="进程重启中断，任务未完成"`（同时回填空 `stderr`）。与 D1 的兜底共用同一列，前端呈现路径一致。

### D6 重试 = 前置校验 + 证据保留（P1，问题 10/11）
- 前置：任务必须处于终态，否则 409「任务执行中，请先取消」（与删除端点语义一致）；`node_ids` 必须是该任务的实际子项，否则 400 并列出无效 id（不静默）。
- 证据：取消「重试前删除日志文件」，改为在日志里追加分隔头 `===== 第 N 次执行 · 2026-11-01 08:00:00 =====`（`attempt` 计数 +1）。`rc/stdout/stderr` 属「当前尝试」字段，重置是合理的；`failure_reason` 随本次尝试重置。
- 前端确认弹窗列出「将重试 N 台：ip 列表」，并说明「上次执行日志保留在日志末尾」。

### D7 列表信息架构（P1，问题 1/2/3/4/12/15）
- 后端载荷：`_to_task_dict` 增 `cluster_name`（join `ps_cluster`）、`created_by_name`（join sys_user，历史 NULL 显示「—」）、`failure_summary`、`skipped_nodes`；`created_by` 建任务时写入 `current_user.id`。
- 前端列：`#`（序号，全站解剖）+ `任务类型` + `集群` + `结果`（状态 chip / 计数 / 分段条 / 失败归因第二行）+ `时间`（结束时间 + 耗时，创建时间进 tooltip）+ `操作`（详情 + ⋯；运行中直出「取消」）。
- 筛选：关键字（任务号 / 节点 IP / 命令关键字，后端 `q` 参数）、集群、任务类型（分组下拉）、状态、时间范围（近 1/7/30 天 / 自定义）。
- 空态：带主行动；批量工具条在勾选后出现（重试 / 删除 / 导出）。

### D8 详情形态 = 独立路由页（已裁决）
现状是 `.modal.modal-wide`（max-width 900）内塞「元信息 + 节点表 + 日志 + 软件矩阵」。日志是这个页面的主战场，弹窗宽度不足以放下日志与表格，才有了「行内展开」这套嵌套。
**推荐**：新增路由 `/node-tasks/:id` → `NodeTaskDetail.vue`；列表「详情」变为 `router.push`；日志用右侧抽屉（宽 720，可拖动）或页内分栏。
**备选（已否决）**：保留弹窗，内部重排为「meta 行 + 四格状态卡 + 节点表 + 日志抽屉」。成本约为主选的一半，但「分享链接 / 浏览器后退 / 刷新保留」三项能力拿不到。

**裁决（2026-11-01，用户确认）**：采独立路由页。要点：
- 新增 `src/views/NodeTaskDetail.vue` + 路由 `node-tasks/:id`（`name: NodeTaskDetail`，feature 门控 `featureRouteMap` 已含 `task_center` 前缀路由，需同步登记）；
- 列表「详情」改为 `router.push({name:'NodeTaskDetail', params:{id}})`，保留 `?from=` 以便返回时恢复筛选与分页；
- 创建任务成功 → 直接跳转该任务详情页（原「停在列表 + toast」改为可关闭的引导 toast）；
- 日志以右侧抽屉承载（宽 720，可拖拽），详情页自身承载结论/上下文/节点表/参数；
- 用户手册节点任务章节与 Dashboard 快捷入口文案同步更新。

### D9 表单可用性（P1，问题 8/9）
- 必填 `*` + 行内逐字段校验（替代合并提示）。
- 任务类型下拉分组：安装部署（安装 OpenResty / 安装 Edge / 关联新 OpenResty）、升级（传包 / 切版本）、运维（启动 / 停止 / 重载 / 状态查询）、查询（软件查询）、执行（命令 / 脚本 / 分发文件）。
- **修 bug**：把 `onTaskTypeChange` 里的加载逻辑抽为 `loadTypeDependentOptions(clusterId, taskType)`，`watch(createClusterId)` 复用同一函数；这是「先选类型再换集群 → 下拉恒空」的根因。
- 节点区：加搜索框、离线节点置灰 + 标注「离线」、计数文案「已选 N / M 台」。
- 执行策略（安全策略）加组标签与一句说明；「超时」单位后缀去掉标签内括号。
- 帮助文案按类型切换（命令/脚本 → 「命令将以清单用户身份在各节点执行」；安装/升级 → 现文案）。
- 创建按钮禁用时 `title` 说明缺哪一项；命令模式加「复制命令」。

### D10 日志可见性（P1，问题 7）
- 行数上限：`MAX_LOG_LINES` 启用，值取 **5000**（设计文档写的 500 对 `install_openresty` 编译输出过少）；超限时写入一行 `已省略后续 N 行（超过 5000 行上限）` 并停止追加。`docs/design/node-task-center.md` 同步修正口径。
- 单节点日志端点补 `Content-Disposition: attachment`。
- 新增 `GET /node-tasks/{task_id}/log-archive`：`application/zip`，内含 `task-{id}-summary.csv`（每节点：ip/状态/rc/耗时/失败原因）+ 各节点 `.log`；挂 `task_center` 权限、写审计（resource_id=task_id）、`test_security_guard.py` 补采样。
- 无日志类型（statistic/start/stop/reload/check）空态文案：「该任务类型不产生实时日志，请查看 stdout/命令」。

### D11 文件入口与术语（P1，问题 13）
页头只保留「＋ 新建任务」；「暂存文件」「任务源文件」降为工具栏次按钮（text 样式），弹窗标题与说明统一术语。不改数据与接口，纯命名与层级。

### D12 状态 chip 单组件化（P1，问题 14）
抽 `components/TaskStatusTag.vue`：输入 status（含 `cancelling` 派生态），输出统一 chip（颜色 + 图标 + 文案）。列表、详情、节点行三处统一消费；其余页面不受影响。

### D13 权限一致性（记录，不做）
建任务挂 `clusters`，任务中心挂 `task_center`——有 `clusters` 无 `task_center` 的用户能建任务却进不了任务中心（D8 路由化后跳转也会 403）。本轮不改权限模型（涉及角色设计），前端在无 `task_center` 权限时创建成功后不跳转、仅 toast，并在 design 待办中记录。

## 影响面与风险

- `install_task` / `install_task_node` 新增 3 列（`failure_reason`、`cancel_requested_at`、`attempt`）+ 启动回填：SQLite 与 PG 双后端都要过 `test_pg_dialect_smoke.py`（AGENTS #31）。
- 归因函数泛化会改变既有失败子项的 `stderr` 内容（新增兜底文案）——既有断言 stderr 为空的测试需同步修正，属语义变更（AGENTS #51④）。
- 统计重算会改写历史任务主表字段：不可逆但方向正确（子项是真值）；迁移脚本需幂等且可重跑。
- 取消通道透传后，`run_playbook` 的 cancel 回调覆盖到 `nginx_cmd`/`statistic`/`software_check`——需实测「取消后进程确实退出」（test 集群节点 5/6 可用）。
- 详情路由化（若采纳）影响用户手册截图与 Dashboard 快捷入口，需同步。

## 未决问题

已裁决（2026-11-01）：详情形态 = 独立路由页（D8）；取消范围 = 四类执行器全量补齐（D3）。

仍待定（不阻塞实施，均属 P2 或可后续追补）：

1. **任务名称/备注**：是否引入 `name`/`remark` 字段（列表可读性提升最大的一项，但需 DB 变更 + 创建表单加字段）。默认不做。
2. **操作人**：`created_by` 本轮开始写入，历史数据保持「—」；是否需要把审计表里的历史操作人回填到任务表（一次性对账脚本）。
3. **权限**：D13 的 `clusters`/`task_center` 不对称是否统一（涉及角色模型设计）。
