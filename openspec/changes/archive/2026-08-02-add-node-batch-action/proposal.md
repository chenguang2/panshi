## Why

当前集群节点操作（启动/停止/reload/状态查询）仅支持单条：工具栏四个按钮依赖 `singleOpEnabled`（勾选 ≥2 节点时全部禁用），需逐个节点操作。批量运维场景（节点批量扩容回滚、集群维护窗口批量重启、批量健康巡检）下操作成本随数量线性放大。集群详情页节点 Tab 是全量节点的操作视图，需要批量操作能力。后端已有 `POST /clusters/{cluster_id}/nodes/action` 批量端点但前端从未使用，需接入并增强。

## What Changes

- **后端批量端点增强（`POST /clusters/{cluster_id}/nodes/action`）**：
  - `BatchAction` 枚举补充 `reload`（映射 `nginx_reload`，与 `restart` 一致语义）
  - `results` 每项补充 `stdout`/`stderr`/`command` 字段（当前仅 `rc`/`detail`，无法展示完整日志）
- **前端批量操作入口**：节点 Tab 勾选 ≥2 节点后，工具栏**启动/停止/reload/状态查询 按钮进入批量模式**（不再禁用），点击后确认弹窗列出选中节点 IP → 调批量端点
  - **批量启动/停止/reload** → 批量端点 + 进度/结果弹窗（逐条显示节点 IP、成功/失败、失败原因）
  - **批量状态查询** → 批量端点 + **结果表格弹窗**（每行：节点 IP、Edge版本、健康状态、失败原因、详情展开）——状态查询结果是表格数据，表格化展示信息密度最高
- 复用现有 `selectedNodeKeys` 多选 + `preserveSelectedRowKeys`（批量删除已建立的交互）；单节点操作（勾选 ≤1）保持现状
- 批量操作统一复用系统 `.modal-overlay` 风格弹窗（与批量删除/导入一致）

## Capabilities

### New Capabilities
- `node-batch-action`: 单集群内批量节点操作——启动/停止/reload/状态查询批量执行，后端批量端点增强（reload + 完整日志字段），前端批量模式按钮分流 + 进度弹窗（动作型）+ 结果表格弹窗（查询型）

### Modified Capabilities
- `cluster-nodes-composable`: `useClusterNodes` 新增批量操作逻辑（`batchNodeAction`、`batchNodeStatus`、`selectedNodeKeys` 驱动批量按钮可用性）
- `cluster-nodes-component`: `ClusterNodes` 组件行为变化——工具栏四按钮批量模式（勾选 ≥2 时执行批量而非禁用）、批量确认弹窗、进度/结果弹窗

## Impact

- **后端**：`backend/app/api/v1/cluster_nodes.py`（`BatchAction` 补 `reload`、`batch_node_action` results 补 stdout/stderr/command）、`backend/app/schemas/cluster.py`（若有 schema 变更）、`backend/tests/test_node_batch_action.py`（批量操作端点测试）
- **前端**：`frontend/src/views/clusters/ClusterNodes.vue`（工具栏四按钮批量分流 + 批量确认/进度/结果弹窗 UI）、`frontend/src/composables/useClusterNodes.ts`（`batchNodeAction`/`batchNodeStatus` + `singleOpEnabled` 批量模式逻辑）、`frontend/src/composables/useClusterUtils.ts`（若复用/扩展 `showBatchResultModal` 支持 stdout 展示）、`frontend/src/types/index.ts`（若需类型）、前端单元/E2E 测试
- **API**：`POST /clusters/{cluster_id}/nodes/action` 增强（body: `{action, node_ids}`；results 补日志字段）
- **行为变更**：勾选 ≥2 节点时工具栏四按钮不再禁用而是执行批量操作（原禁用逻辑改为批量分流）
- **无数据库变更、无新依赖**（复用现有批量端点 + 弹窗管线）
