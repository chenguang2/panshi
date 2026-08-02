## 1. 后端：批量端点增强

- [x] 1.1 `backend/app/api/v1/cluster_nodes.py`: `BatchAction` 枚举补 `reload`；**`batch_node_action` 显式校验 node_ids 为空返回 400 "node_ids 不能为空"**（防操作全部节点）
- [x] 1.2 `backend/app/services/ansible_service.py`: `NGINX_CMD_MAP` 补 `{reload: 'nginx_reload'}`
- [x] 1.3 `backend/app/api/v1/cluster_nodes.py`: `batch_node_action` **成功分支** results 补 `stdout`/`stderr`/`command`；**statistic 分支解析 `detail.get("statistic")` 返回 statistic 字段**（Edge版本/健康）；**失败分支仅 detail**（无 result 可获取）
- [x] 1.4 `backend/tests/test_node_batch_action.py`: 新增批量操作端点测试——批量 start 成功（含 stdout/stderr/command 字段）、批量 reload 映射 nginx_reload、批量 statistic 返回（**含 statistic 字段**）、单条失败不阻塞其余（404 节点混入）、**空 node_ids 400**、**失败分支无 stdout 仅 detail**
- [x] 1.5 运行 `cd backend && uv run pytest` 验证后端测试通过（对比基线确认无新增失败）

## 2. 前端：批量操作过程弹窗 + composable

- [x] 2.0 新建 `BatchActionProgressModal.vue`：系统 modal-overlay 过程弹窗——每节点一行（IP + 状态：等待中/执行中/成功/失败），点击行展开查看该节点命令/rc/stdout/stderr（TDD：行渲染/状态/展开/关闭 测试先行）
- [x] 2.1 `frontend/src/composables/useClusterNodes.ts`: 新增 `batchProgressVisible`/`batchProgressTitle`/`batchProgressItems`/`batchProgressExpandedIp` 状态 + `runWithConcurrency` 工具函数（`BATCH_ACTION_CONCURRENCY=5` 并发限流）；`batchNodeAction(cluster, action, label)`——读取 `selectedNodeKeys` → **自定义 modal-overlay 确认弹窗**（复用 confirmState 模式，列出选中 IP ≤3 全列 + "等 N 条"；**stop 红色警示**）→ **并发限流逐个调用单节点端点 `/nodes/{id}/{action}`**（同时最多 5 个，与后端信号量对齐）→ 每节点更新 `batchProgressItems[i]`（pending→running→success/error + logs）→ 请求前清空双状态 → `loadNodes` 刷新（TDD：循环调用/并发限流/状态更新/失败节点日志/清空 测试先行）
- [x] 2.2 `useClusterNodes.ts`: `batchNodeStatus(cluster)`——**并发限流逐个调用单节点 statistic 端点 `/nodes/{id}/statistic`（body {ports}）** → **过程弹窗展示每个节点执行过程**（🔄执行中→✅/❌，与 batchNodeAction 一致）→ 完成后关闭过程弹窗 → `showBatchStatusModal` 表格弹窗（IP/Edge版本/健康/失败原因，解析 `statistic.edge_version` + `nginx_running`）→ 请求前清空 → `loadNodes` 刷新（TDD：并发调用/过程弹窗状态/表格行解析 测试先行）
- [x] 2.3 `useClusterUtils.ts`: `BatchResultItem` 扩展可选 `detail`/`rc` 字段；**新增 `showBatchStatusModal(title, rows)` 表格弹窗**（系统 modal-overlay：表头 IP/Edge版本/健康/失败原因）（TDD：表格渲染/版本列 测试先行）
- [x] 2.4 `ClusterNodes.vue`: 渲染 `BatchActionProgressModal`（绑定 batchProgress 状态 + toggle-expand）+ useClusterNodes return 导出全部新状态/函数（vue-tsc 通过）

## 3. 前端：ClusterNodes.vue 工具栏批量分流

- [x] 3.1 `ClusterNodes.vue`: 新增 `batchOpEnabled` 计算属性（`batchCount > 1`）；工具栏四按钮 `:disabled="!(singleOpEnabled || batchOpEnabled)"`（TDD：组件测试先行）
- [x] 3.2 `ClusterNodes.vue`: 四按钮文案带计数——`启动(N)`/`停止(N)`/`reload(N)`/`状态查询(N)`（batchCount > 0 时）（TDD：组件测试先行）
- [x] 3.3 `ClusterNodes.vue`: 点击分流——`batchCount > 0` → `batchNodeAction`/`batchNodeStatus`；否则单节点操作现状（`handleNodeStart`/`handleNodeStop`/`handleNodeReload`/`queryNodeStatus`）（TDD：组件测试先行，vue-tsc 通过）
- [x] 3.4 确认 `编辑节点` 按钮仍仅 `singleOpEnabled`（不批量）

## 4. 前端测试

- [x] 4.1 Vitest: `batchNodeAction`（并发限流 ≤5、确认标题 ≤3/等N条、过程弹窗状态、失败节点日志、清空）、`batchNodeStatus`（表格行解析）——useClusterNodes.test 通过
- [x] 4.2 Vitest: 工具栏批量分流、计数文案、批量/单节点切换——ClusterNodes 组件测试通过
- [x] 4.3 E2E (Playwright): `e2e/node-batch-action.spec.ts`——批量启动流程（勾选2行→确认→结果弹窗→清空）、批量状态查询表格。导航到集群详情页节点 Tab；节点 < 2 时 test.skip
- [x] 4.4 运行 `cd frontend && npx vitest run` 验证（基线对比确认 0 新失败）；E2E 通过；`npx vue-tsc --noEmit` 通过

## 5. 规格同步

- [x] 5.1 同步 `openspec/specs/node-batch-action/spec.md`（新能力：ADDED 全部需求）
- [x] 5.2 同步 `openspec/specs/cluster-nodes-composable/spec.md`——MODIFIED「useClusterNodes composable」（返回值含 batchNodeAction/batchNodeStatus + 批量操作/状态查询场景）
- [x] 5.3 同步 `openspec/specs/cluster-nodes-component/spec.md`——MODIFIED「ClusterNodes component」（工具栏批量模式 + 计数文案 + 编辑仅单选场景）
