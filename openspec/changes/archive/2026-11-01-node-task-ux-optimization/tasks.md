# node-task-ux-optimization 任务清单

> 约定：全部按 TDD（先 RED 验证失败原因，再 GREEN）；后端测试复用 `tests/api_helpers.py`；前端组件测试 mock 形状取自真实接口（AGENTS #43）；改行为语义时回归同域既有测试（AGENTS #51④）；改 schema/写库路径后必跑 `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py`（AGENTS #31）。
> 评审基线：`docs/refactoring/node-task-ux-review-2026-11-01.md`；截图 8 张在 `/tmp/opencode/shots/`。
> 已裁决（2026-11-01）：D8 详情形态 = 独立路由页；D3 取消范围 = 四类执行器全量补齐。剩余未决项（任务名称、操作人回填、权限）不影响本清单。

## 1. 后端 · 失败可归因（P0，design D1/D5）
- [x] 1.1 RED：`tests/test_node_task_failure_attribution.py`——6 类归因 + 兜底 + rc=0 无命中 + `shell_stdout` 覆盖；先跑红（`AttributeError: classify_ansible_failure` 不存在，34 failed/1 passed）
- [x] 1.2 `ansible_service._ansible_false_success_error` 泛化为 `classify_ansible_failure(result, ip, rc=None)`（旧名保留为薄封装，rc=0 语义不变），`_run_item` / `_execute_distribute_batch` / 异常兜底分支**不区分 rc** 写归因；GREEN
- [x] 1.3 RED：重启恢复用例——遗留 running 子项改判 failed 且 `failure_reason` 为「进程重启中断，任务未完成」，空 `stderr` 一并回填（D5）；GREEN
- [x] 1.4 RED：任务级 `failure_summary` 聚合（`3 台节点不在 Ansible 主机清单中；1 台节点 SSH 认证失败` 式）+ 列表端点**单次附加查询**（有 `queries == 1` 守卫）；`_to_task_dict` 仅在算得非 None 时输出该键；GREEN
- [x] 1.5 回归：`pytest -k "node_task or install_task"` 116 passed（无需改既有断言）；扩面 `-k "… or cmd_exec or edge_env or security_guard"` **309 passed**；PG 冒烟 11 passed
- [x] 1.6 实现期修正（主评审补）：**认证失败优先级高于无法连接**——ansible 的 SSH 认证失败包在 `UNREACHABLE!` 里，先判 unreachable 会把密码问题误导成网络问题；新增 `test_auth_failure_wins_over_unreachable`（RED 实测输出「无法连接，请检查网络与 SSH 服务」，改后 36 passed）

## 2. 后端 · 统计一致性（P0，design D2）
- [x] 2.1 RED：`tests/test_node_task_stats_consistency.py` 8 用例——混合状态计数、陈旧 `total_nodes=1`+3 子项（`assert 1 == 3`）、重试不累加（重置腿即时一致）、回填幂等（二次返回 0）、重启恢复后统计同步、端点含 `skipped_nodes`
- [x] 2.2 实现 `_recompute_stats`（唯一算法，`total_nodes=len(items)`），接线 `_finalize_task`/`create_task`/`_reset_failed_items_on`/`recover_interrupted_tasks`；`skipped_nodes` 列 + 迁移条目；启动 `backfill_task_stats()`（lifespan 内、`recover_interrupted_tasks` 之后）；GREEN
- [x] 2.3 PG 冒烟（`test_pg_dialect_smoke.py` 11 passed）且新测试在 PG 模式同样 8 passed
- [x] 2.4 实现期修正（主评审）：`backfill_task_stats` 改为**两条聚合/窄列查询**（`GROUP BY task_id,status` 计数 + 只取五个计数列），原先加载全量 ORM 行会把 `install_task_node.stdout`（完整 ansible 输出，单节点可达数 MB）与 `install_task.params`（脚本全文）读进内存，启动期开销随历史线性膨胀；改后行为不变（8 用例仍绿、PG 仍绿）

## 3. 后端 · 取消真实化（P0，design D3/D4）
- [x] 3.1 RED：`tests/test_node_task_cancel_real.py` 15 用例（真进程 kill / 参数透传 / 子项状态 / 取消请求持久化 / API 载荷）；GREEN
- [x] 3.2 补进程组杀链：`_run_subprocess`/`_run_subprocess_stream` 加 `start_new_session=True` + cancel watcher（SIGTERM→3s→SIGKILL），`_run_ssh_with_fallback`/`_install_openresty_ssh`/`_software_check_node` 透传；`nginx_cmd`/`statistic` 补 `cancel_event` + `on_progress`（顺带让这两类任务不再零日志）
- [x] 3.3 `cancel_requested_at` 列（+迁移条目）、cancel 端点贯穿请求会话置位（幂等）、API 载荷 `cancel_requested`/`cancel_requested_at`、SSE `task_update` 同步
- [x] 3.4 `_finalize_task` 并入 cancelled 判定（「1 完成 + 2 取消」此前会被误判 success）
- [x] 3.5 实现期修正（主评审）：批量分发腿 `_execute_distribute_batch` 补 cancelled 语义——它与单节点腿并列，取消时子项此前仍落 failed，导致批量分发任务的「取消」与「失败」分不开；新增 `test_distribute_batch_records_cancelled`（RED 实测 `assert 'failed' == 'cancelled'`，改后 16 passed）
- [~] 3.6 实机验证（test 集群，2026-11-01）——**部分通过，挖出真问题**：取消 `cmd_exec`（`sleep 45`，节点 192.168.0.14）后 DB 8s 内落 `cancelled`（rc=254）+ `cancel_requested_at` 入库，但 `ps` 显示 `ansible-playbook` 仍在跑，节点上命令**执行到自然结束**（约 45s 后才消失）。根因：killpg 只覆盖新增的 SSH 子进程；ansible 腿走 ansible-runner，其 `cancel_callback` 只在**任务边界**生效，单个长命令内部无法中断 → 「已取消」与事实不符
- [x] 3.7 **[已定：硬杀]** ansible 腿真取消——`run_playbook` 注入 `panshi_run_token`，`hard_kill_ansible_playbook(token)` 遍历 `/proc/*/cmdline` 精确匹配「ansible-playbook + token」后 SIGTERM→3s→SIGKILL；**关键发现：只改 `cancel_callback` 不够**（ansible-runner 用 `child.expect(timeout=5)` 读输出，静默期内根本不轮询回调，实测 +4s 仍有 2 个进程）→ 另起 `cancel_event` watcher 经 `to_thread` 立即硬杀；`pgid == 自身进程组` 时退化为单 pid 信号（防 killpg 误伤后端）
- [x] 3.8 取消状态卫生（第 4 组暴露的真 bug）：重试时 `_cancel_flags[task_id]` **换新 Event**（旧对象已 set 会让新执行立刻被判已取消）+ 清 `cancel_requested_at` + 广播 `cancel_requested=False`；`cancel_task` 对终态任务幂等无副作用（不再给已结束任务挂「取消中」）
- [x] 3.9 实机验收（2026-11-01，两次独立复验）：`cmd_exec` `sleep 40/45` → 取消后 `pgrep -fc '[a]nsible-playbook'` 由 2 变 **0（+0.5s 内清空）**；任务 `cancelled`、子项 rc=254、原因「任务已被取消，执行已中断」；远端 `ps` 确认节点侧 `sleep` 已中断（不再跑到自然结束）。注：首次用 `pgrep -fc ansible-playbook` 计量会**匹配到自身 shell 命令行**导致假残留，计量须用 `[a]` 包裹

## 4. 后端 · 重试与导出（P1，design D6/D10）
- [x] 4.1 RED：`tests/test_node_task_retry_and_logs.py`——running/pending 重试实测返回 200（`{"status":"retrying"}`）、`node_ids=[1,777]` 静默 200，两条现状缺陷取证；终态任务重试 200
- [x] 4.2 实现前置校验（api 404/409/400 + service 双层，中文文案）；**重试保留证据**改为 `rotate_log` 改名留档（`{node_id}.attempt{N}.log`，旧原因追加到旧日志末尾）+ `attempt` 列 +1（未采用「分隔头」方案，理由见 4.2b）；GREEN
- [x] 4.2b 与 4.2 原文的偏离（有意）：原计划「追加 `===== 第 N 次执行 =====` 分隔头替代删除文件」，实际采用**整份留档改名**——活动日志保持空文件（前端「本次输出」语义干净），旧证据（输出 + 失败原因）完整落在 `attempt{N}.log`，可经 `?attempt=N` 回看
- [x] 4.3 RED：单节点日志 `?download=true` 带 `Content-Disposition`；整任务导出返回 zip；`test_security_guard.py` 补两条端点采样（99 passed）
- [x] 4.4 实现导出：`GET /{task_id}/logs/archive` → `application/zip`（**实机验证**：任务 #10 下载 1211 字节，条目按 IP 分目录 `10.99.99.3/3.log`…，缺日志节点写 `_missing.txt`）；单节点下载头实测 `content-disposition: attachment; filename="10-10.99.99.3-3.log"`。**与原计划的偏离**：路径用 `/logs/archive`（原写 `/log-archive`）、只打包日志不生成 CSV 摘要（用户价值低、维护成本高）
- [x] 4.5 日志上限 5000 行生效（`task_log_store.MAX_LOG_LINES` 为唯一事实源，`ansible_service` 复用）+ 截断提示行 + `log_line_count` 只记实际保存行数；`docs/design/node-task-center.md` 500→5000 口径同步
- [x] 4.6 回归全量 **2745 passed / 11 skipped**，PG 冒烟 11 + 新测试在 PG 下 23 passed

## 5. 后端 · 列表载荷（P1，design D7）
- [x] 5.1 RED：`tests/test_node_task_list_payload.py` 10 用例——三端点载荷（display_name 优先/回退 name/集群已删 null）、新建任务 `created_by` 落库、`q` 三命中（任务号/大写 IP/大写命令）、`cluster_id`、时间范围含当天边界 + 非法参数 400、查询次数守卫（1 行 vs 5 行 SQL 次数相等）
- [x] 5.2 实现：`_task_list_stmt` 两次 `outerjoin`（`ps_cluster`/`sys_user`）+ 共享 `_list_task_page`（无 N+1）；创建端点注入 `current_user` 写 `created_by`；`q`（lower+LIKE，纯数字兼作任务号）、`cluster_id`、`created_from/to`（日期型 to 取 `time.max`，带时区折 UTC）；GREEN 10 passed，`-k "node_task or install_task"` **151 passed**，PG 21 passed
- [x] 5.3 守卫有效性反向验证：临时改成逐行回查 → 查询次数守卫变红（1 条=6、5 条=14），撤销后复绿

## 6. 前端 · 列表（P1，design D7/D11/D12）
- [x] 6.1 RED：`NodeTaskCenter.test.ts` 新增 12 例 + `format.test.ts` 7 例——六列解剖（`#/任务类型/集群/结果/时间/操作`）、`#` 跨页公式、集群列 `cluster_name` 与 `—` 占位、结果列三层、失败行归因、搜索回车带 `q`、时间范围带 `created_from`、勾选出现工具条且 running 行禁选、两态空态；RED 12 failed / 38 passed（真实取证：「仍是 9 列」「`.result-cell` 一个都没有」「`[data-test=task-search]` 不存在」）
- [x] 6.2 列表重排落地：结果列三层（chip + 计数 + 分段条 + 归因，`min-height` 固定行高实测 83/84px 不漂移）；时间列合并「结束时间 + 耗时」（走 `format.ts` 新增 `formatDurationCompact`，不再视图内 `new Date()`）；操作列改文字链 + `⋯`；筛选条与表格同一卡片（`q`/集群/状态/类型/时间快捷/刷新），`listParams()` 与 3s 轮询共用；批量工具条（running 行禁选）；`#emptyText` 两态空态。GREEN：视图+format **79 passed**，全量 `--maxWorkers=4` **2338 passed**，`vue-tsc -b` exit 0
- [x] 6.2c 守卫同步（有意）：`uxReviewL.source.test.ts` L6 原断言「详情必须是 `<a-button>`」与本轮文字链冲突，改为断言 `class="link-action"` 的 `<button>`；**守卫意图不变**（详情直出、不藏进 `⋯` 菜单，第二行断言保留）
- [x] 6.5 取消任务的摘要文案：子项归因原文「任务已被取消，执行已中断」套 `{n} 台节点` 前缀读成「1 台节点任务已被取消」（同句两个「任务」）；`_failure_label` 对取消归因直接返回「已取消」→ 摘要为「1 台已取消」。RED `assert '1 台节点任务已被取消' == '1 台已取消'` → 37 passed，实机列表确认生效
- [x] 6.2b 分段进度条 `TaskProgressBar.vue`（成功/失败/跳过/取消/执行中条纹，失败必须有可见红段、`min-width` 保证单台也可见）+ 列表「进度」列与状态筛选补「跳过」——实机截图确认：失败任务整条红（此前为空灰条）、部分成功为绿+红分段、取消为灰段；`npx vitest run --maxWorkers=4` **2321 passed**，`vue-tsc -b` 通过
- [x] 6.3 `TaskStatusTag.vue` 抽件 + 三处消费 + 组件测试（含「取消中」态）
- [x] 6.4 页头入口降级（暂存文件 / 任务源文件）与术语统一（含弹窗标题/说明/空态）——页头只剩 1 个 primary；两入口降为筛选条行尾文字链 + 数量徽章；源码 0 处旧称（仅测试负向断言保留）；RED 6 failed → GREEN 56 passed

## 7. 前端 · 详情页路由化（P1，design D8，已裁决）
- [x] 7.1 RED：`NodeTaskDetail.test.ts` 18 例 + `nodeTaskDetail.test.ts` 12 例——结论区（chip/计数/分段条/归因/建议）、上下文行、参数 key-value 与折叠原始 JSON、日志抽屉、历史尝试、终态不建 SSE、空日志文案、建议规则；RED 实测「模块不存在」+ `routerPush` 未被调用 + 列表页仍含 `detailVisible`
- [x] 7.2 新增 `views/NodeTaskDetail.vue`（745 行）+ 列表「详情」`router.push`（带筛选 query）+ 整行可点（勾选框/按钮不劫持）+ 创建成功跳详情；列表页删除详情 modal 与其状态/方法/导入（**移除 ≈330 行，新增 ≈35 行**，2470→2394）
- [x] 7.3 日志抽屉 `components/NodeTaskLogDrawer.vue`：右侧 Teleport、默认 **720px**、左缘拖拽（钳 420px~视口-120px，无第三方库）；复用 `NodeTaskLogViewer` 四页签；`下载本次日志` + `查看历史尝试`（`?attempt=N`）+ 运行中实时徽章
- [x] 7.4 路由与门控：`featureRouteMap.task_center` 改数组（列表 + 详情同开关，静态注册零残留）、`navMeta` 面包屑第三层 `#id`、侧边栏 `/node-tasks` 在详情页保持高亮、参数化路由不进 Ctrl+K 索引
- [x] 7.5 流实现抽件 `composables/useNodeTaskStream.ts`（SSE fetch + Authorization、2000 行缓冲、断流回退轮询），列表页与详情页共用单点实现
- [x] 7.6 验收（截图）：详情 URL `/node-tasks/12?q=10.99&status=failed&range=7d` → 返回后 URL 与三个筛选控件值全部恢复；抽屉 720→拖拽 860px；参数区折叠/展开实测

## 8. 前端 · 创建表单（P1，design D9）
- [x] 8.1 RED：必填 `*` + 失焦/提交逐字段中文校验（`请选择集群`/`至少一个节点`/`请输入命令`/`脚本内容不能为空`/`请输入目标目录路径`）+ 首个错误滚动定位；节点区虚线空态 + 搜索 + **离线节点禁用并标注**；执行策略组标签与说明；超时统一 160px + `秒` 后缀；分段控件选中态降级；命令模式 `复制命令`。RED 30 failed（含 22 条既有用例因选择器现代化先红）；GREEN 视图 **79 passed**、全量 **2387 passed**、`vue-tsc -b` exit 0
- [x] 8.1b 创建按钮可读性：禁用态改灰底灰字 + `cursor:not-allowed` + 「还差什么」提示（原白字压淡青底对比度约 1.9:1）
- [x] 8.1c 表单测试选择器现代化：集群下拉改用 `data-test="create-cluster"`（原用「第一个无 data-test 的 select」，新增属性后失效）；节点计数文案改 `已选 x 个（共 y）`
- [x] 8.2 抽 `loadTypeDependentOptions(clusterId, taskType)` 并被 `watch(createClusterId)` 复用 —— **已完成（2026-11-01）**：`onTaskTypeChange` / `watch(createClusterId)` 共用该实现，`loadEdgePackFiles/Versions` 改为显式传 clusterId；新增 4 用例（切换集群重载 / 无依赖类型不发请求 / 切换类型回归），RED 2 failed → GREEN 35/35，`vue-tsc -b` 通过。「必填星号 / 节点搜索 / 执行策略标签」等其余表单项仍归 8.1 实施
- [x] 8.3 帮助文案按任务类型切换并移到相关字段下方（安装/升级类「参数自动读取」、命令执行「以清单用户身份执行」、软件查询、分发文件各一条）；删除底部固定误导长文案（`grep '任务参数将从节点记录自动读取'` → 0）
- [x] 8.4 详情页原因列配色修正：整句原因由 `--danger` 改常规前景色（红色只留给状态 chip，避免满屏告警感）


## 9. 收口与验收
- [x] 9.1 全量前端 `npx vitest run --maxWorkers=4` → **177 files / 2388 tests passed, EXIT=0**；`npx vue-tsc -b` exit 0；后端全量 `uv run pytest` → **2758 passed / 11 skipped, EXIT=0**（8:59）；PG 冒烟 11 passed。附带修掉全量前端 `exit 1` 的真因（`StreamProxyFormWizard` 的 `scrollIntoView` 在 jsdom 未实现 → 4 条 Unhandled Rejection，用例全过但退出码非零）
- [x] 9.2 实机验收（12344/12345 + test 集群）：① 失败归因上屏——任务 #12（节点 10.99.99.3 不在清单）列表 `failure_summary`=「1 台节点不在 Ansible 主机清单中」、详情建议「确认节点已加入 Ansible 主机清单后重试」；② 取消真终止——`cmd_exec` `sleep 40` 取消后 `pgrep -fc '[a]nsible-playbook'` 2→0（+0.5s），任务 `cancelled`、子项 rc=254；③ 重试保留证据——任务 #12 重试后 `3.attempt0.log` 生成、`attempt=1`、`?attempt=0` 返回 200；④ 导出——`/logs/archive` 200 且 zip 按 IP 分目录、单节点 `?download=true` 带 attachment 头；⑤ 统计回填——历史 #1/#2/#3 `total_nodes` 1→3
- [x] 9.2b 顺手修掉一个会破坏验收环境的隐患：`tests/test_dev_scripts.py` 未隔离 `PANSHI_PROJECT_ROOT` 时，`stop.sh` 的孤儿清扫会 SIGKILL 真实开发服务（实测全量 pytest 后 `/health` 000）。改为默认隔离到 `tmp_path`，实测「14 passed 且 after=200」。已记入 AGENTS #62
- [x] 9.3 用户手册第 30 章重写（232 行 → 约 240 行，全部术语改为「暂存文件/任务源文件」、详情改为独立页、新增失败归因速查与取消不回滚警示）+ 7 张新截图 `30-01..30-07`（`git add -f` 入库，已删除不再被引用的 `25-01..25-04`、`28-01..28-02`）；`manual-screenshots.mjs` 扩展 action 类型（`select` 支持 index、`blur`、`checkFirstEnabled`）并登记第 30 章清单，成为可复现产线
- [x] 9.3b `docs/test-cases.md` 同步：TC-NOD-12 术语更新，新增 TC-NOD-16..27（归因/统计一致性/取消真终止/取消不回滚提示/终态取消幂等/重试守卫/重试保留证据/日志上限/日志导出/列表载荷与过滤/详情直达与筛选恢复/状态与进度呈现）
- [x] 9.3c 全量前端 vitest 的 `exit 1` 根因修复：`StreamProxyFormWizard` 的 `scrollIntoView` 在 jsdom 未实现导致 4 条 Unhandled Rejection（**用例本身 2387 全过但退出码非零**，会让「全绿」信号失真）；在该测试文件补齐 DOM 桩后单跑 38 passed / exit 0
- [x] 9.4 `openspec validate --all` → **196 passed / 0 failed**；CLI 归档合并：`node-task-center` +7 新增需求、`task-log-file-storage` +1 新增 / ~1 修改，变更归档为 `2026-11-01-node-task-ux-optimization`
