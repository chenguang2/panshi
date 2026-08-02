## Context

节点操作当前仅支持单条：`ClusterNodes.vue` 工具栏四个按钮（启动/停止/reload/状态查询）依赖 `singleOpEnabled`（useClusterNodes.ts:438——`batchCount <= 1 && ...`），**勾选 ≥2 节点时全部禁用**。单节点操作链路成熟：`executeNodeAction`（L473，走 `NodeExecutionResultDrawer` 展示完整日志/统计）与 `queryNodeStatus`（L623）。

**关键现状**：后端已有批量端点 `POST /clusters/{cluster_id}/nodes/action`（cluster_nodes.py:471-511），body `NodeActionRequest{action: BatchAction, node_ids}`，**串行循环**逐个 `_run_and_update`，返回 `{action, results: [{node_id, ip, status: success|error, rc|detail}]}`。但：
1. `BatchAction` 枚举（L47-52）只有 `start/stop/restart/check/statistic`，**无 `reload`**
2. `NGINX_CMD_MAP`（ansible_service.py:211-216）有 `{start→nginx_start, stop→nginx_stop, restart→nginx_reload, check→nginx_check}`，无独立 reload 键
3. `batch_node_action` 的 results **仅含 `rc`/`detail`，不含 `stdout/stderr/command`**——与单节点端点不同，无法展示完整日志
4. **前端从未调用该端点**（grep 0 匹配），且**无测试**

**复用基础（已建立）**：
- `selectedNodeKeys` 多选 + `preserveSelectedRowKeys` + 搜索/排序清除（批量删除已实现）
- `showBatchResultModal(title, items: BatchResultItem[])`（useClusterUtils.ts:208）——系统 modal-overlay 结果弹窗，展示每条 ip/status/error
- `showDeleteConfirm`/`executeDeleteWithProgress` 确认+进度管线
- ansible 全局并发信号量 `MAX_CONCURRENT_PLAYBOOKS=5`（ansible_service.py:25）——批量并发安全上限已知

**节点操作无权限校验**（cluster_nodes.py 仅 `Depends(get_db)`），前端仅安装按钮受 feature 开关控制。

## Goals / Non-Goals

**Goals:**
- 勾选 ≥2 节点后工具栏四按钮（启动/停止/reload/状态查询）进入批量模式（替代原禁用逻辑）
- 批量启动/停止/reload：一次请求 + 进度/结果弹窗逐条展示（含失败原因）
- 批量状态查询：结果表格弹窗（每行 IP/Edge版本/健康/详情）
- 后端批量端点增强：`BatchAction` 补 `reload`；results 补 stdout/stderr/command
- 复用现有 `selectedNodeKeys` 多选 + 系统 modal-overlay 弹窗

**Non-Goals:**
- 跨集群批量操作（限定单集群节点 Tab）
- 批量"安装/升级/关联"等安装类操作（受 feature 开关控制，不在本次范围）
- 节点批量操作的历史记录/审计（无此需求）
- 并发执行批量操作（沿用后端串行 + 信号量，不引入并行调度）

## Decisions

### D1: 后端 BatchAction 补 reload + NGINX_CMD_MAP + 空 node_ids 防护
**决策**：`BatchAction` 枚举补 `reload`；`NGINX_CMD_MAP` 补 `{reload: 'nginx_reload'}`（与 restart 同语义）。批量 reload 与批量 restart 行为一致（nginx reload）。
**补充（已确认）**：`batch_node_action` **显式校验 node_ids 为空返回 400 "node_ids 不能为空"**——现状 `NodeActionRequest.node_ids` 默认 `[]` 且 `if body.node_ids:` 会查询操作全部节点，危险；与批量删除/创建的空列表 400 一致。
**理由**：工具栏已有 reload 按钮，批量模式需对应枚举值；映射成本一行；空 node_ids 防误操作全部节点。
**备选**：批量 reload 复用 `restart` 值 → 前端语义混淆（restart 对 reload 不直观），否决；空 node_ids 保持现状 → 误操作全部节点，否决。

### D2: 后端 results 补 stdout/stderr/command + statistic
**决策**：`batch_node_action` **成功分支** results 追加 `stdout`/`stderr`/`command`（取自 `_run_and_update` 返回的 `r`，L505 附近 `r.get("stdout")` 等）；**statistic 分支**像单节点端点（L422-426）那样解析 `detail.get("statistic")` 返回 `statistic` 字段（含 edge_version/nginx_running）——供前端状态表格填充 Edge版本/健康列。
**失败分支（已确认）**：`_run_and_update` 失败时抛 `HTTPException(502/504)` 且无 result 返回，失败分支**仅返回 detail**（"操作失败: {e}"）——不补 stdout/stderr（失败时无 result 可获取，保持现状）。
**理由**：批量端点与单节点端点对齐；前端结果弹窗可展示成功日志/失败原因，状态表格可展示版本/健康。
**备选**：仅 detail → 批量失败时无法定位根因，否决；改造 `_run_and_update` 失败不抛异常 → 影响单节点端点，否决。

### D3: 前端批量动作型操作 batchNodeAction（启动/停止/reload）——循环单端点 + 过程弹窗
**决策（已确认：循环单端点 + 过程弹窗）**：`useClusterNodes` 的 `batchNodeAction(cluster, action: 'start'|'stop'|'reload', label)`：
- 读取 `cluster.selectedNodeKeys`，映射为节点列表
- **确认弹窗（自定义 modal-overlay，复用 confirmState 模式）**：列出选中 IP（≤3 全列 + "等 N 条"）；**stop 操作文案强调"将中断所有选中节点流量"（红色警示）**
- 确认后**循环逐个调用单节点端点** `/nodes/{id}/{action}`（与单节点 `executeNodeAction` 一致，非批量端点）——每节点独立请求，逐个展示过程
- **过程弹窗 `BatchActionProgressModal`（新增组件）**：系统 modal-overlay 风格，每节点一行（IP + 状态：等待中/执行中/成功/失败），点击行展开查看该节点命令/rc/stdout/stderr（与单节点 execDrawer 展示逻辑一致）
- 请求前先清空双状态；完成后 `loadNodes` 刷新
**理由**：后端批量端点一次返回无法展示逐节点过程；循环单端点可复用单节点端点（含完整日志）并实时更新每节点状态，与单节点操作体验一致。
**备选**：批量端点一次请求 + 结果警告框（现状）→ 无过程展示，用户反馈缺失；后端流式返回 → 改动大，否决。

### D4: 前端批量状态查询 batchNodeStatus（循环单端点 + 表格化）
**决策（已确认：循环单端点）**：`useClusterNodes` 的 `batchNodeStatus(cluster)`：
- 循环逐个调用单节点 statistic 端点 `/nodes/{id}/statistic`（body `{ports}`，与单节点 `queryNodeStatus` 一致）
- **新增 `showBatchStatusModal` 表格弹窗（系统 modal-overlay）**：表头 节点IP / Edge版本 / 健康状态 / 失败原因；每行从单节点 statistic 响应解析（**与单节点 `queryNodeStatus` 一致：`statistic.edge_version` + `nginx_running`**）
- 请求前清空双状态；完成后 `loadNodes` 刷新
**理由**：状态查询结果是**表格数据**（版本/健康/统计），表格化信息密度最高；循环单端点复用单节点 statistic 端点（含 statistic 字段）。
**备选**：批量端点一次请求 → 无逐节点过程且需后端补 statistic 字段；复用 showBatchResultModal 简单列表 → 缺版本/健康列，否决。

### D5: 工具栏四按钮批量分流（singleOpEnabled 改造）
**决策**：`ClusterNodes.vue` 工具栏四个按钮的禁用逻辑改为：
- `singleOpEnabled`（勾选 ≤1）：单节点操作（现状，走 `executeNodeAction`/`queryNodeStatus`）
- `batchOpEnabled`（勾选 ≥2）：批量操作（走 `batchNodeAction`/`batchNodeStatus`）
- 按钮 `:disabled="!(singleOpEnabled || batchOpEnabled)"`；点击时分流：`batchCount > 0 ? 批量 : 单个`
- 批量操作按钮文案带计数：`启动(N)`/`停止(N)`/`reload(N)`/`状态查询(N)`
**理由**：原 `singleOpEnabled` 在勾选 ≥2 时禁用四按钮（为保护单选操作），批量操作应改为复用同一多选状态执行批量；与批量删除按钮分流一致。
**注意**：编辑节点仍仅单节点可用（`editNode` 走 `singleOpEnabled`，不批量）。**批量 check 不暴露**（工具栏无 check 按钮，后端 BatchAction 保留 check 但前端不接入——Non-Goal 标注）。

### D6: 批量操作确认与结果弹窗复用
**决策**：**确认弹窗用自定义 modal-overlay**（复用 ClusterNodes.vue 现有 `confirmState` 模式：标题+内容+确认/取消，非 `showDeleteConfirm`）——列出选中 IP（≤3 全列 + "等 N 条"），stop 操作红色警示文案。**结果弹窗**：动作型复用 `showBatchResultModal`（前端映射 `{ip, status, error: detail}`，扩展 `BatchResultItem` 加可选 `rc`/`detail` 字段）；查询型用**新增 `showBatchStatusModal` 表格弹窗**。`clearSelectedFn` 清空双状态。
**理由**：遵循 AGENTS.md「删除流程统一用 useClusterUtils.ts 共享函数」精神；`showDeleteConfirm` 是删除专用（含数据库/Edge 复选框）不适合操作确认。
**补充**：`showBatchResultModal` 若需展示 stdout 详情，扩展 `BatchResultItem` 加可选 `detail`/`stdout` 字段并支持展开（TDD 先行）。

### D7: 并发与刷新
**决策（已确认：前端并发限流）**：批量操作**前端并发限流**——`runWithConcurrency` 工具函数按 `BATCH_ACTION_CONCURRENCY=5`（与后端 `MAX_CONCURRENT_PLAYBOOKS=5` 对齐）同时执行最多 5 个节点，其余排队。过程弹窗显示全部节点同时"🔄执行中"，逐个完成更新；等待中节点显示"⏳等待中"排队。
**理由**：后端 `run_playbook` 是 async 函数受 `asyncio.Semaphore(5)` 控制，天然支持并发；前端串行是瓶颈。并发限流避免连接风暴，且过程弹窗展示全部节点执行过程（用户反馈需求）。完成后 `loadNodes(cluster)` 刷新节点状态/版本。
**备选**：前端全并行 `Promise.all` → 节点多时连接风暴，否决；后端批量端点改 asyncio.gather → 无法展示逐节点过程，否决。

## Risks / Trade-offs

- [批量端点缺日志字段（现状）] → D3/D4：**循环单节点端点**（含完整命令/rc/stdout/stderr），不经批量端点
- [reload 无枚举/映射（现状）] → D1：BatchAction + NGINX_CMD_MAP 补 reload（保留后端增强，虽前端已改循环单端点）
- [空 node_ids 操作全部节点（现状）] → D1：显式校验空列表返回 400（后端防御）
- [批量执行无过程展示（用户反馈）] → D3：`BatchActionProgressModal` 过程弹窗（每节点行 + 展开日志）
- [批量状态查询缺 statistic 数据] → D4：循环单节点 statistic 端点（含 statistic 字段）
- [批量状态查询结果非日志形态] → D4：`showBatchStatusModal` 表格弹窗（IP/版本/健康/详情）
- [勾选 ≥2 时四按钮原禁用，改批量分流是否误操作] → 自定义确认弹窗列出全部 IP + 计数 + stop 红色警示，确认后才执行
- [批量执行中途某节点失败] → 逐节点 try/except，失败节点记 error 不阻塞其余；过程弹窗该行标红 + 可展开日志
- [ansible 并发上限 5 与串行冲突] → 前端串行循环（一次一个节点），信号量天然安全
- [批量操作无权限校验] → 与单节点现状一致（无权限校验），不在本次范围
- [循环单端点 N 次请求较慢] → 串行保证过程真实可见；大规模节点可后续优化（本次 Non-Goal）

## Migration Plan

- 无数据库变更、无新依赖
- 后端：`BatchAction`/`NGINX_CMD_MAP`/`batch_node_action` 增强，独立部署，兼容旧调用（新增字段向后兼容）
- 前端：工具栏按钮分流改造 + 批量弹窗，向后兼容（单节点操作不变）
- 回滚：后端增强可单独回滚（仅字段补充）；前端批量分流回滚恢复原禁用逻辑

## Open Questions

- ~~批量操作走现有批量端点还是前端循环单端点？~~ **已定**：**循环单节点端点**（D3/D4，与单节点一致的过程展示，非批量端点）
- ~~批量操作是否需要过程展示弹窗？~~ **已定**（D3）：`BatchActionProgressModal` 过程弹窗（用户反馈需求）
- ~~批量 reload 如何映射？~~ **已定**（D1）：BatchAction 补 reload，NGINX_CMD_MAP 补 `{reload: 'nginx_reload'}`（后端保留，兼容性）
- ~~空 node_ids 操作全部节点？~~ **已定**（D1）：显式校验空列表返回 400（后端防御）
- ~~状态查询批量结果如何展示？~~ **已定**（D4）：`showBatchStatusModal` 表格弹窗（IP/版本/健康/详情）
- ~~动作型操作批量结果如何展示？~~ **已定**（D3）：`BatchActionProgressModal` 过程弹窗（每节点行 + 展开日志）
- ~~勾选 ≥2 时四按钮原禁用改批量分流？~~ **已定**（D5）：批量分流 + 计数文案 + 确认防呆
- ~~批量操作并发还是串行？~~ **已定**（D7）：**前端并发限流**（`runWithConcurrency`，同时 5 个，与后端信号量对齐），过程弹窗展示全部节点执行
- ~~失败分支日志字段？~~ **已定**：逐节点 try/except，失败节点该行标红 + 展开日志展示 detail
- ~~确认弹窗复用 showDeleteConfirm？~~ **已定**（D3/D6）：自定义 modal-overlay 确认弹窗
- ~~批量 check 是否暴露？~~ **已定**（D5）：不暴露（工具栏无 check 按钮，Non-Goal）
- ~~批量 stop 危险提示？~~ **已定**（D3）：确认弹窗红色警示"将中断所有选中节点流量"
- ~~statistic 解析路径？~~ **已定**（D4）：与单节点 queryNodeStatus 一致（statistic.edge_version + nginx_running）
