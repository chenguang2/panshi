# node-task-ux-optimization 提案

## Why

节点任务模块 UX 五维评审（2026-11-01，见 `docs/refactoring/node-task-ux-review-2026-11-01.md`，22 项问题：5 高 / 10 中 / 7 低）发现四类核心缺陷：

1. **失败不可解释（高危）**：`stderr` 只在「rc=0 假成功」这一条路径上有中文归因，真实失败（rc≠0）的 `stderr` 常为空、无日志文件。实机任务 #11 两节点 `rc=4`，用户在列表看到「失败」，在详情看到「失败 / rc 4」，展开日志只有英文 ansible traceback 与 ANSI 色码——**运维拿不到「为什么」和「下一步做什么」**。同期任务 #10 的中文归因文案质量很好，证明能力已有、覆盖不全。
2. **统计口径失真（高危）**：`total_nodes` 只在创建时取一次，`success/failed_nodes` 在收尾时由子项计数，两者会漂移。实机任务 #1/#2/#3 主表 `total_nodes=1` 而子项有 3 条，列表显示物理不可能的 **`2/1 成功`**；进度条按 `success/total` 计算，失败任务呈现为**空条**（看起来像未开始）。
3. **操作承诺与能力脱节（高危）**：spec 要求「任一任务类型可取消」，实现里 `nginx_cmd`（start/stop/reload/check）、`statistic`、`software_check`、脚本模式 `cmd_exec` **六类完全不消费 cancel_event**，但行菜单对所有运行中任务都渲染「取消」。点下去只有一句「任务取消已发起」，状态不变、最终变成失败或成功。同时 `cancelled_nodes` 恒为 0（子项从不写 `cancelled`）、无取消请求持久化，刷新后「取消中」消失；进程重启中断的任务也不写原因（spec 要求带「进程重启中断」标记）。
4. **信息架构缺口（中）**：全局任务列表跨集群却没有「集群」列；`created_by` 列存在但端点从不写入，无操作人；「状态 / 节点 / 进度」三列表达同一件事且「节点」列显示的是「1/4 成功」（与详情里同名但显示 IP 的列冲突）；详情是 900px 弹窗，装不下日志，看失败原因要 4 层点击且对不产生日志的任务类型得到空面板；日志无下载/导出且无行数上限（设计文档承诺的 500 行未生效）。

另有两处功能性缺陷：切换集群后「安装包 / 版本包」下拉不再刷新（先选类型再换集群 → 恒空）；重试会静默删除上次日志并清空 rc/stderr，复盘证据消失。

## What Changes

**P0（反馈可信度）**
- 失败归因覆盖所有 rc：新增统一分类函数（清单缺失 / 不可达 / 认证失败 / 超时 / 磁盘 / 权限 / 未知），结果落 `install_task_node.failure_reason` 并回填空 `stderr`；任务级 `failure_summary` 随列表与详情返回。
- 统计一致性：`total/success/failed/skipped/cancelled` 一律由子项重算（创建 / 收尾 / 重试后），启动迁移回填历史不一致行。
- 取消真实化：`nginx_cmd`/`statistic`/`software_check`/脚本 SSH 补齐取消通道；`cancel_requested_at` 落库；被中断子项写 `cancelled`，未开始写 `skipped`；重启中断写原因。

**P1（体验与一致性）**
- 列表：新增「集群」列与「失败原因」列；「状态 + 节点 + 进度」合并为「结果」单元格（状态 chip + 计数 + 分段进度条）；`#` 序号列对齐全站；时间列合并；搜索（任务号/节点 IP/命令）+ 集群 + 时间范围筛选；空态带主行动；勾选后出现批量工具条（重试/删除/导出）。
- 详情：结论置顶（状态 + 计数 + 失败原因 + 处理建议 + 主操作「重试 N 台失败节点」），补上下文行（任务号/类型/集群/发起人/创建/开始/结束/耗时），参数改可读 key-value + 折叠原始 JSON + 复制，「展开 / 完整日志」合并为「查看日志」打开日志抽屉。
- 日志：单节点日志支持下载（Content-Disposition）；新增整任务日志归档导出（zip：各节点日志 + 结果 CSV）；行数上限生效（可配置，默认 5000，超限写截断标记）；无日志类型给明确空态文案。
- 创建表单：必填 `*`、任务类型分组下拉、切换集群重拉安装包/版本包（修 bug）、节点搜索 + 离线禁选、执行策略加组标签与说明、帮助文案按类型切换、创建按钮禁用原因 tooltip、命令模式加「复制命令」。
- 重试：终态前置校验（非终态 409）、`node_ids` 归属校验、日志改为追加分隔行保留上次证据（不再删除）。
- 文案与入口层级：页头仅保留「＋ 新建任务」为主行动，「暂存文件 / 任务源文件」降为次按钮；状态 chip 单组件化（列表/详情/节点行共用）。

**P2（本轮不做，记待办）**：任务名称/备注、任务模板与最近使用、批量重试、结果导出到 Excel、SSE 事件序号与去重键、任务对比、`check` 与 `edge_env_deploy` 前端可达性、按任务查询源文件端点、权限不对称（建任务需 `clusters`、看任务中心需 `task_center`）。

## Capabilities

### New Capabilities

无新增能力域；全部落在既有 `node-task-center` 与 `task-log-file-storage` 之内。

### Modified Capabilities

- `node-task-center`：
  - ADDED「任务结果可归因」——失败原因统一归类、持久化并在列表/详情呈现。
  - ADDED「任务统计一致性」——统计由子项重算，杜绝 `2/1` 类失真。
  - ADDED「取消请求状态可见」——取消请求落库、取消中中间态、被取消子项计入统计。
  - ADDED「任务中心列表信息架构」——集群/失败原因列、结果单元格合并、搜索与筛选、空态、批量工具条。
  - ADDED「任务详情呈现」——结论置顶、上下文行、可读参数、单一日志入口。
  - ADDED「创建任务表单可用性」——必填标识、类型分组、切换集群重拉、节点可搜索与离线禁选、按类型帮助文案。
  - ADDED「任务重试的前置条件与证据保留」——终态校验、归属校验、上次日志保留。
- `task-log-file-storage`：
  - MODIFIED「日志文件存储」——增补行数上限与截断标记、单节点日志下载头。
  - ADDED「日志导出归档」——整任务 zip 导出（节点日志 + 结果 CSV），挂 `task_center` 权限并写审计。

> 说明：`node-task-center` 中「取消与并发保护」（所有任务类型可取消）、「任务执行引擎」（进程重启带中断标记）、「任务化 API」（列表可按时间筛选、`created_by`）三条**现文已要求**而实现未达标，属实现违规修复，不产生 spec 变更；新增需求只补呈现与契约，不与现文矛盾。

## Impact

- Affected specs: `node-task-center`（6 ADDED）、`task-log-file-storage`（1 MODIFIED + 1 ADDED）
- Affected code:
  - backend: `app/services/node_task_service.py`（归因分类、统计重算、取消通道透传、重启原因、重试证据保留）、`app/services/ansible_service.py`（归因函数泛化）、`app/api/v1/node_tasks.py`（列表/详情载荷扩展、重试校验、日志下载与归档端点、created_by 写入）、`app/models/node_task.py`（`failure_reason`、`cancel_requested_at`、`attempt` 列）、`app/services/task_log_store.py`（行数上限、归档打包）、启动迁移（回填统计与新增列）
  - frontend: `src/views/NodeTaskCenter.vue`（列表重排、筛选项、空态、批量工具条）、新增 `src/views/NodeTaskDetail.vue`（独立详情页，路由 `node-tasks/:id`，D8 已裁决）、`src/components/NodeTaskLogViewer.vue`（下载、空态文案）、`src/composables/useNodeTasks.ts`（类型与接口）、`src/api/scriptUpload.ts`（文件视图命名）
  - tests: 后端归因分类 / 统计一致性 / 取消透传 / 重试校验 / 导出端点；前端列表与详情组件测试；`tests/test_security_guard.py` 采样补新增端点
  - docs: `docs/refactoring/node-task-ux-review-2026-11-01.md`（评审报告）、`docs/design/node-task-center.md`（500 行上限口径修正）、用户手册节点任务章节
