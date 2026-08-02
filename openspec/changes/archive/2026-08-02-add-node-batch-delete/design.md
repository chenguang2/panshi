## Context

节点删除当前仅支持单条：`ClusterNodes.vue` 表格的 `row-selection` 是"伪单选"（checkbox 外观但只存 1 条，`onChange` 取 `rows[rows.length-1]`，行 87），工具栏 编辑/启动/停止/状态查询/删除 全部依赖 `cluster.selectedNode`。删除管线（`deleteNode` → `showDeleteConfirm` → `executeDeleteWithProgress`）已成熟（useClusterNodes.ts:364-386），且 `clearSelectedFn` 回调本就是为批量勾选清理预留的。

**节点删除的特殊性**：单删端点 `delete_node`（cluster_nodes.py:272-293）中，Edge 阶段**固定返回 `skipped`**——"节点是 Edge 运行时，无对应的 Edge API 删除操作"。批量端点须保持相同语义，不调用任何 Edge 同步。

**复用基础（已存在）**：
- `executeDeleteWithProgress` 已支持 `resourceKey` 批量模式（`{field, label, nameField, keys}`），上游/路由批量删除已验证
- `BatchCreateNodesRequest`/`BatchDeleteRoutesRequest`/`BatchDeleteUpstreamsRequest` 是 `*Request(DeleteClusterRequest)` 继承模式参考
- 上游批量删除（add-upstream-batch-delete）的双状态选择、删除按钮分流、D9 搜索/排序清除、rollback 模式均已验证

**与上游/路由批量的关键差异**：
1. **无关联守卫**：节点不被他资源引用（上游有"被路由引用"守卫，节点没有）
2. **Edge 阶段固定 skipped**：节点是 Edge 运行时，无 Edge API 删除
3. **单选操作按钮更多**：编辑/启动/停止/状态查询（不止编辑/发布）

## Goals / Non-Goals

**Goals:**
- 单集群内批量删除节点，逐条容错，失败不阻塞
- 维持并增强"点行即选"单选逻辑（编辑/启动/停止/状态查询 照旧）
- 批量勾选跨页保留（服务端分页）
- 复用现有确认弹窗 + 进度弹窗管线（executeDeleteWithProgress resourceKey 模式）
- Edge 阶段固定 skipped（与单删语义一致）

**Non-Goals:**
- 跨集群批量删除（全局节点管理页 NodeList 不在本次范围）
- 批量启动/停止/状态查询等其他批量操作
- 节点级别的 Edge 同步细分（节点无 Edge API 删除）

## Decisions

### D1: 双状态选择模型（selectedNode + selectedNodeKeys）
**决策**：保留 `cluster.selectedNode`（单选，行点击驱动）作为单选操作对象；新增 `cluster.selectedNodeKeys: number[]`（checkbox 驱动）作为批量对象。`selectNodes` 联动：勾选 1 行 → `selectedNode = rows[0]`（维持现状）；勾选 ≥2 行 → `selectedNode = null`（单选按钮经现有 `:disabled="!cluster.selectedNode"` 自然禁用）。
**补充（P2 决策）**：单选按钮的禁用不能仅依赖 `selectedNode`——勾选 ≥2 行后用户点击行会让 `customRow` 重新设置 `selectedNode`，导致单选按钮"复活"。因此单选操作按钮（编辑/启动/停止/状态查询）的可用性须显式绑定批量状态：`selectedNodeKeys.length <= 1 && (!!selectedNode || selectedNodeKeys.length === 1)`，即勾选 ≥2 行时**强制禁用**，无论 `selectedNode` 是否有值。
**理由**：与上游/路由批量完全同构，antd-vue 4.x 无 `selectRowByClick`，行点击（customRow）与 checkbox（rowSelection.onChange）是天然独立的事件通道，双状态零冲突。
**备选**：a) 单一 `selectedRowKeys` 驱动一切 → 编辑/启动退化为"必须恰好选 1 条"，破坏现有 UX，否决；b) 批量模式切换 → 增加模式状态复杂度，否决。

### D2: 行点击用 customRow 驱动 selectedNode
**决策**：表格加 `:custom-row="(record) => ({ onClick: () => { cluster.selectedNode = record } })"`。
**理由**：现状"选中"实际靠点 checkbox 列触发（无 customRow、无 selectRowByClick），点行本身无效果。加 customRow 后"点行即选"是从无到有的增强，与上游/路由 Tab 行为一致。
**风险**：checkbox 点击已 stopPropagation，不会误触行点击。

### D3: 批量删除按钮分流
**决策**：删除按钮逻辑——`selectedNodeKeys.length > 0` → 批量删除（按钮文案 `删除节点(N)`）；否则 `selectedNode` → 单删（现状）。`handleDeleteClick` 计算属性 `batchCount`/`deleteCount`/`deleteEnabled` 与上游 Tab 同构。
**理由**：批量优先于单选，避免勾选后误删单选目标；无批量勾选时行为与现状完全一致。

### D4: 跨页保留 preserveSelectedRowKeys: true（翻页保留、搜索/排序清除）
**决策**：rowSelection 设置 `preserveSelectedRowKeys: true`。
**理由**：服务端分页下，antd-vue 默认 `onChange` 会过滤掉非当前页 key，勾选跨页会静默丢失；`preserveSelectedRowKeys` 配合缓存保留全部 key。**补充**：勾选仅"翻页保留"；**搜索/排序时自动清除** `selectedNodeKeys`（在 `loadNodes` 中检测 search/sort 参数变化时清空，或 `handleNodeTableChange` 排序分支显式清除）。理由：翻页是同数据集不同页，保留合理；搜索/排序改变数据集，保留会误删筛选结果之外的节点（防呆）。
**注意**：`handleNodeTableChange`（useClusterNodes.ts:170-190）目前排序变化**不**清除选择，需补充（镜像上游 handleUpstreamTableChange 修复）。
**备选**：全保留（搜索/排序也保留勾选）→ 搜索后删除会连带筛选外节点，仅靠确认弹窗列表兜底，否决；全清除（翻页也清）→ 与用户决策相悖，否决。

### D5: 后端批量端点 DELETE /clusters/{cluster_id}/nodes
**决策**：新增端点，body 为 `BatchDeleteNodesRequest(DeleteClusterRequest)` 加 `node_ids: list[int] = Field(...)`（空列表由端点显式返回 400，不设 min_length 以避免 422，与 `BatchDeleteUpstreamsRequest` 模式一致）。循环现有单删逻辑（cluster_nodes.py:272-293），**每条节点独立 `db.commit()`**，逐条 try/except，返回按 node 分组的 `results`。
**补充决策（已确认）**：
- 循环体用 `except Exception`（穷尽捕获）——全局异常处理器会把未捕获异常转 500，单条失败必须隔离
- **except 分支 `await db.rollback()`**（防 pending-rollback 拖垮整批，镜像上游/路由批量修复）
- **Edge 阶段固定 `skipped`**：与单删一致，节点是 Edge 运行时无 Edge API 删除，不调用 delete_on_nodes
- 节点查找用 **`edge_sync.get_or_404(db, Node, id=node_id, cluster_id=cluster_id)`**（与其他批量端点统一；`get_or_404` 抛 `HTTPException(404, "节点不存在")`，混入他集群 id 时该条计入失败，不阻塞其余）
- **results 每条显式含 `node_ip` 字段**（ip 值）——供前端 `logBatchDeleteResults` 按 `nameField='node_ip'` 显示，避免"删除节点 undefined"
- **message 与上游/路由统一**：返回 `批量删除完成: {len(results)} 条节点`（总条数，含失败）
- DB 块 `await db.delete(node)` + `db.commit()`
**理由**：单集群内批量，一次请求、进度连续；逐条容错避免"一条失败全盘失败"。
**备选**：前端循环单删端点 N 次 → N 个进度弹窗、部分失败处理复杂，否决。

### D6: 复用 executeDeleteWithProgress resourceKey 批量模式
**决策**：`deleteNodes(cluster)` 组装选中节点 IP 列表 → `showDeleteConfirm`（**不传 `nodes` 参数**——与单删 `deleteNode` 一致，节点删除 Edge 阶段固定 skipped，确认弹窗无需节点选择）→ `executeDeleteWithProgress`（传 `resourceKey: { field: 'node_ids', label: '节点', nameField: 'node_ip', keys }`）；`clearSelectedFn` 传 `() => { cluster.selectedNodeKeys = []; cluster.selectedNode = null }`。
**日志确认（已定）**：进度日志保持 `删除节点 10.0.0.1: 数据库✅ / Edge 跳过`——Edge 固定 skipped 是节点语义，用户可见 Edge 阶段自动跳过，透明；`logBatchDeleteResults` 按 `nameField='node_ip'` 读取后端 `results[].node_ip`。
**理由**：遵循 AGENTS.md「删除流程统一用 useClusterUtils.ts 共享函数」；`resourceKey` 批量模式已由上游/路由验证，零新增弹窗逻辑。
**备选**：为节点单独复制一套批量进度函数 → 代码重复，否决。

### D7: 确认弹窗 IP 列表
**决策**：批量删除确认弹窗标题组合选中节点 IP——≤3 条全列，>3 条截断 + "等 N 条"。复用 `showDeleteConfirm` 的 `title` 字符串传参，不改弹窗组件。
**理由**：安全诉求（误删风险），IP 可见 + 数量明确；改动最小。

### D8: 搜索/排序清除批量勾选
**决策**：`loadNodes` 检测到搜索条件（`nodesSearch`/`nodesSearchField`）或排序条件（`nodesSortBy`/`nodesSortOrder`）变化时，清除 `selectedNodeKeys`（及 `selectedNode`）；`handleNodeTableChange` 排序分支显式清除。
**理由**：搜索/排序改变数据集，保留勾选会误删筛选结果之外的节点。与 D4"翻页保留"形成完整语义：**翻页保留、搜索/排序清除**（镜像上游 D9）。

### D9: 类型与状态初始化
**决策**：`frontend/src/types/index.ts` 的 `Cluster` 接口新增 `selectedNodeKeys?: number[]`（紧邻 `selectedNode`，镜像 `selectedRouteKeys`）；`frontend/src/views/CentralList.vue` 的 `loadClusters` cluster map 初始化 `selectedNodeKeys: []`。
**理由**：与上游/路由批量完全同构，向后兼容（可选字段）。

## Risks / Trade-offs

- [批量中单条 DB 异常拖垮整批] → D5：except 分支 `db.rollback()`（镜像上游批量修复）
- [勾选多行后单选按钮复活] → D1 补充：单选按钮可用性显式绑定批量状态，勾选 ≥2 强制禁用
- [搜索/排序后勾选残留误删] → D8：搜索/排序时清空勾选
- [跨页勾选残留：某节点在翻页/搜索后被后端删除] → 删除时后端逐条 404 计入失败；`clearSelectedFn` 删除成功后清空全量勾选
- [批量循环未捕获异常转 500] → D5：循环体 `except Exception` 穷尽捕获 + rollback
- [节点 Tab 表格有自定义状态列/操作列干扰 row-selection] → 现有表格已支持 row-selection，仅改选中逻辑，列渲染不动
- [Edge 阶段无实际操作，用户误以为会删 Edge] → 与单删一致固定 skipped，进度弹窗展示"Edge 跳过"，文案与单删统一
- [只勾 Edge（delete_db=false）时"假删除"] → **继承现有单删语义**（Edge 固定 skipped 且 DB 不删 = 实际未删任何东西）；文档标注此限制，不在本次批量端点改变（保持现状）
- [node_ip 字段缺失导致日志 undefined] → D5：批量端点 results 显式含 `node_ip`，与 `nameField='node_ip'` 对齐

## Migration Plan

- 无数据库变更、无依赖新增
- 后端：新增端点 + schema，独立部署，旧端点不受影响
- 前端：types 新增字段（可选）+ CentralList 初始化默认值，向后兼容
- 回滚：删除端点回滚即恢复单删行为，前端 `selectedNodeKeys` 字段无副作用

## Open Questions

- ~~批量删除确认弹窗中 Edge 节点选择：沿用单删弹窗的节点多选还是仅"全部活跃节点"开关？~~ **已定**：沿用现有 `showDeleteConfirm` 弹窗节点多选（同一集群节点），零改动
- ~~节点批量删除的 Edge 阶段如何处理？~~ **已定**（D5）：与单删一致固定 skipped（节点是 Edge 运行时，无 Edge API 删除）
- ~~勾选 ≥2 后点行行为？~~ **已定**（P2）：单选按钮随批量状态强制禁用
- ~~搜索/排序后批量勾选？~~ **已定**（P3）：翻页保留、搜索/排序清除
- ~~进度弹窗文案与请求体字段？~~ **已定**（D6）：resourceKey `{field: 'node_ids', label: '节点', nameField: 'node_ip', keys}`
- ~~results 字段与 nameField 对齐？~~ **已定**（D5）：批量端点 results 显式含 `node_ip`
- ~~只勾 Edge 的"假删除"？~~ **已定**：保持现状（继承单删语义），文档标注限制
- ~~Edge 跳过日志？~~ **已定**（D6）：保留"Edge 跳过"文案
- ~~E2E 数据不足？~~ **已定**（D4 补充）：镜像 upstream/route E2E 的 skip 模式
- ~~确认弹窗 nodes 参数？~~ **已定**（D6）：不传 nodes（与单删一致）
- ~~message 文案？~~ **已定**（D5）：统一"批量删除完成: N 条节点"
- ~~404 处理方式？~~ **已定**（D5）：用 `edge_sync.get_or_404`
