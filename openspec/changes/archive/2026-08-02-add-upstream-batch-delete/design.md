## Context

上游删除当前仅支持单条：`ClusterUpstreams.vue` 表格的 `row-selection` 是"伪单选"（checkbox 外观但只存 1 条，`onChange` 取 `rows[rows.length-1]`，行 76），工具栏 编辑/删除/发布/版本管理 全部依赖 `cluster.selectedUpstream`。删除管线（`deleteUpstreamByRecord` → `showDeleteConfirm` → `executeDeleteWithProgress`）已成熟，且 `clearSelectedFn` 回调本就是为批量勾选清理预留的。

**上游与路由的关键差异**：上游删除有**关联路由守卫**——`deleteUpstreamByRecord`（useClusterUpstreams.ts:715-722）在删除前加载路由列表并检查 `routes.some(r => r.upstream_id === upstream.id)`，被引用的上游直接报错"该上游已被路由引用，请先删除这些路由"。批量删除必须逐条保留此守卫。此外，单删后端端点（cluster_upstreams.py:169-193）**不校验空 `edge_uuid`**（`delete_on_nodes` 不检查，`EdgeClient.api()` 的 `if resource_id:` 对空串为假 → 静默发集合级 DELETE），是隐藏炸弹，批量端点需补守卫（路由批量已有此模式）。

ant-design-vue 4.2.6 能力边界（已从路由批量实现验证）：
- **无 `selectRowByClick`**（React 版才有）——行点击天然不触发 checkbox，两通道独立
- checkbox 单元格 `stopPropagation`——点 checkbox 不会冒泡到行，点行不会勾 checkbox，双状态零冲突
- 行点击官方 API 是 `customRow` prop，返回 `{ onClick, ... }` 绑定 `<tr>`
- `preserveSelectedRowKeys`、`getCheckboxProps` 在 4.2.6 均存在

约束：批量删除限定单集群（集群详情页上游 Tab），不跨集群；遵循 AGENTS.md「删除流程统一用 useClusterUtils.ts 共享函数」约定；后端 SQLite async 引擎不启用 `PRAGMA foreign_keys=ON`（database.py:20 仅 sync 引擎挂载），FK CASCADE 不触发，必须手动删 `UpstreamTarget`/`ConfigVersion` 行。

## Goals / Non-Goals

**Goals:**
- 单集群内批量删除上游，逐条容错，失败不阻塞
- 维持并增强"点行即选"单选逻辑（编辑/发布/版本管理 照旧）
- **保留关联路由守卫**：被路由引用的上游不可删除，批量中逐条拦截不阻塞其余
- 批量勾选跨页保留（服务端分页）
- 复用现有确认弹窗 + 进度弹窗管线
- 补齐单删后端空 `edge_uuid` 守卫缺口

**Non-Goals:**
- 跨集群批量删除（全局上游管理页 UpstreamList 不在本次范围）
- 批量发布 / 批量复制等其他批量操作
- 节点级别的 Edge 同步细分（批量确认弹窗不按集群分组选节点）
- 删除被路由引用的上游（含级联删除引用路由）——保持单删的"先删路由再删上游"语义

## Decisions

### D1: 双状态选择模型（selectedUpstream + selectedUpstreamKeys）
**决策**：保留 `cluster.selectedUpstream`（单选，行点击驱动）作为单选操作对象；新增 `cluster.selectedUpstreamKeys: number[]`（checkbox 驱动）作为批量对象。`selectUpstreams` 联动：勾选 1 行 → `selectedUpstream = rows[0]`（维持现状）；勾选 ≥2 行 → `selectedUpstream = null`（单选按钮经现有 `:disabled="!cluster.selectedUpstream"` 自然禁用）。
**补充（P2 决策）**：单选按钮的禁用不能仅依赖 `selectedUpstream`——勾选 ≥2 行后用户点击行会让 `customRow` 重新设置 `selectedUpstream`，导致单选按钮"复活"。因此单选操作按钮（编辑/发布/版本管理）的可用性须显式绑定批量状态：`selectedUpstreamKeys.length <= 1 && (!!selectedUpstream || selectedUpstreamKeys.length === 1)`，即勾选 ≥2 行时**强制禁用**，无论 `selectedUpstream` 是否有值。
**理由**：与路由批量（add-route-batch-delete D1）完全同构，antd-vue 4.x 无 `selectRowByClick`，行点击（customRow）与 checkbox（rowSelection.onChange）是天然独立的事件通道，双状态零冲突。
**备选**：a) 单一 `selectedRowKeys` 驱动一切 → 编辑/发布退化为"必须恰好选 1 条"，破坏现有 UX，否决；b) 批量模式切换 → 增加模式状态复杂度，否决；c) 双勾选列 → UI 混乱，否决。

### D2: 行点击用 customRow 驱动 selectedUpstream
**决策**：表格加 `:custom-row="(record) => ({ onClick: () => { cluster.selectedUpstream = record } })"`。
**理由**：现状"选中"实际靠点 checkbox 列触发（无 customRow、无 selectRowByClick），点行本身无效果。加 customRow 后"点行即选"是从无到有的增强，与路由 Tab 行为一致。
**风险**：checkbox 点击已 stopPropagation，不会误触行点击。

### D3: 批量删除按钮分流
**决策**：删除按钮逻辑——`selectedUpstreamKeys.length > 0` → 批量删除（按钮文案 `删除上游(N)`）；否则 `selectedUpstream` → 单删（现状）。`handleDeleteClick` 计算属性 `batchCount`/`deleteCount`/`deleteEnabled` 与路由 Tab 同构。
**理由**：批量优先于单选，避免勾选后误删单选目标；无批量勾选时行为与现状完全一致。

### D4: 跨页保留 preserveSelectedRowKeys: true（翻页保留、搜索/排序清除）
**决策**：rowSelection 设置 `preserveSelectedRowKeys: true`。
**理由**：服务端分页下，antd-vue 默认 `onChange` 会过滤掉非当前页 key，勾选跨页会静默丢失；`preserveSelectedRowKeys` 配合缓存保留全部 key。**补充**：勾选仅"翻页保留"；**搜索/排序时自动清除** `selectedUpstreamKeys`（在 `loadUpstreams` 中检测 search/sort 参数变化时清空，或 `handleUpstreamTableChange` 排序分支显式清除）。理由：翻页是同数据集不同页，保留合理；搜索/排序改变数据集，保留会误删筛选结果之外的上游（防呆）。
**语义统一（已确认）**：**单选与批量统一为「翻页保留、搜索/排序清空」**——`selectedUpstream` 单选同样翻页保留（行不可见但状态不清）。依据：路由实现的 `lastRouteQuery`（useClusterRoutes.ts:284-298）只对比 `search/field/sortBy/sortOrder`，**不含 page**，翻页不触发清除；设计文档初版误写"单选翻页清空"，与实际实现不符，已修正。上游实现保持一致：翻页不清、搜索/排序清。
**注意**：`handleUpstreamTableChange`（useClusterUpstreams.ts:277-300）目前排序变化**不**清除选择，需补充（路由版本已在 handleRouteTableChange 处理）。
**备选**：全保留（搜索/排序也保留勾选）→ 搜索后删除会连带筛选外上游，仅靠确认弹窗列表兜底，否决；全清除（翻页也清）→ 与用户决策相悖，否决。

### D5: 关联路由守卫（上游特有）——前端过滤跳过 + 后端权威双保险
**决策（已确认：过滤跳过 + 提示，非整体拦截）**：批量删除前逐条检查上游是否被路由引用。`deleteUpstreams(cluster)` 中：
1. 若 `cluster.routes` 未加载则懒加载（复用 `deleteUpstreamByRecord` 现有逻辑，useClusterUpstreams.ts:704-714）
2. 过滤被引用上游（`r.upstream_id === upstream.id`），**从待删列表中剔除**，`message.warning` 列出被跳过项（"上游 X 已被路由引用，已跳过"）
3. 仅未引用的上游进入确认弹窗标题 + 批量请求；若全部被引用则直接提示、不弹确认窗
**前端守卫是尽力而为**：懒加载路由仅取第一页（`page_size: PAGE_SIZE_DROPDOWN`），引用路由在第 2+ 页时前端**可能漏检**——这是已知限制，由后端全量查询兜底（权威防线），进度弹窗中展示后端返回的 failed 原因。
**理由**：保持与单删一致的语义——不允许删除被引用的上游（后端 Route.upstream_id 是 `ondelete=SET NULL`，删了会让路由静默失去上游）。与路由批量"DNS 整体拦截"不同：上游被引用是常态（上线服务通常都被路由引用），整体拦截会因 1 条被引用而整批不删，体验差；"过滤跳过"更符合"逐条容错不阻塞"的批量哲学。
**备选**：a) 照抄路由 DNS 守卫整体拦截 → 一条被引用就整批失败，体验差，否决；b) 前端不做检查、依赖后端 → 确认弹窗标题会列入实际不会删的上游，UX 差，否决；c) 前端全量拉取路由检查 → 额外请求 + 大 page_size，成本高，且后端仍是权威，否决。
**补充（后端，已确认无条件拦截）**：批量端点后端循环内同样执行引用检查（查 `Route` 表 `upstream_id == id`），被引用的上游计入失败 `{"status":"failed","error":"该上游已被路由引用"}`，不阻塞其余——双保险。**守卫无条件**：与 `delete_db`/`delete_edge` 组合无关（只删 Edge 时被引用上游同样拦截——Edge 上删掉被引用上游会让路由在 Edge 失效）。

### D6: 后端批量端点 DELETE /clusters/{cluster_id}/upstreams
**决策**：新增端点，body 为 `BatchDeleteUpstreamsRequest(DeleteClusterRequest)` 加 `upstream_ids: list[int] = Field(...)`（空列表由端点显式返回 400，不设 min_length 以避免 422，与 `BatchDeleteRoutesRequest` 模式一致，schemas/cluster.py:219-225）。循环现有单删逻辑（cluster_upstreams.py:169-193），**每条上游独立 `db.commit()`**，逐条 try/except，返回按 upstream 分组的 `results`。
**补充决策**：
- 循环体用 `except Exception`（穷尽捕获）——全局异常处理器会把未捕获异常转 500，单条失败必须隔离
- **`except` 分支必须 `await db.rollback()`（已确认，新增）**：若异常发生在 DB 事务进行中（如 `db.execute(delete)` 后、`db.commit()` 前抛错），async session 进入 pending-rollback 状态，后续条目的 `db.execute`/`db.commit` 会全部抛 `PendingRollbackError`，一条失败拖垮整批。rollback 恢复 session 干净状态。**顺带修复路由批量 `delete_routes_batch`（cluster_routes.py:353-356）的同样 bug**（同一模式，except 分支补 rollback，tasks.md 体现）
- **关联路由守卫（无条件）**：循环内查 `Route.upstream_id == upstream_id`，被引用 → 记失败 `{"status":"failed","error":"该上游已被路由引用"}`，跳过删除；**与 `delete_db`/`delete_edge` 组合无关**（只删 Edge 时同样拦截）
- `edge_uuid` 为空/None 的上游**跳过 Edge 同步**并记 `{"scope":"edge","status":"skipped","message":"该上游无 edge_uuid，跳过 Edge 同步"}`——补齐单删缺口
- **单删端点 `delete_upstream` 同样补 `edge_uuid` 守卫（已确认，新增）**：空 edge_uuid 时跳过 Edge 同步并记 skipped，彻底消除集合级 DELETE 风险（`EdgeClient.api()` 空 resource_id → `DELETE /edge/admin/upstreams` 集合级删除，edge_client.py:312-315）；tasks.md 增加对应任务
- `active_nodes` 在**循环外取一次**（镜像 `delete_routes_batch`，cluster_routes.py:314-318），而非单删的循环内 `get_active_nodes`
- `get_or_404` 抛 `HTTPException(404, "上游服务不存在")`，混入他集群 id 时该条计入失败，不阻塞其余
- DB 块手动删除：`UpstreamTarget`（`upstream_id == id`）→ `ConfigVersion`（`resource_type == "upstream"`）→ `db.delete(upstream)` → `db.commit()`（SQLite async 无 FK cascade，必须手动）
**理由**：单集群内批量，一次请求、进度连续；逐条容错避免"一条失败全盘失败"。
**备选**：前端循环单删端点 N 次 → N 个进度弹窗、部分失败处理复杂，否决。
**风险**：上游属于同一集群（前端从该集群上游列表勾选），`upstream_ids` 中混入他集群 id 时 `get_or_404` 报"上游服务不存在"→ 该条计入失败结果，不阻塞其余。

### D7: 复用 executeDeleteWithProgress 扩展 resourceKey（统一对象，双模式）
**决策（已确认：resourceKey 统一对象方案）**：`DeleteProgressOptions` 增加可选 `resourceKey?: { field: string; label: string; nameField: string; keys: number[] }`，替换初版的 `routeIds?: number[]` + `resourceLabel` 组合：
- `field`: 请求体字段名（`'route_ids'` | `'upstream_ids'`）
- `label`: 日志文案资源名（`'路由'` | `'上游'`）
- `nameField`: 批量结果中的名称字段（`'route_name'` | `'upstream_name'`）
- `keys`: 批量删除的 id 列表
`executeDeleteWithProgress` 据此动态拼装请求体字段（不再硬编码 `route_ids`）并按 `nameField`/`label` 解析批量结果日志（useClusterUtils.ts:330 现状硬编码 `route_ids`，:365-377 硬编码"路由"——一并参数化）。上游调用方传 `{ field: 'upstream_ids', label: '上游', nameField: 'upstream_name', keys }`；路由调用方传 `{ field: 'route_ids', label: '路由', nameField: 'route_name', keys }`（兼容现有路由批量调用）。`clearSelectedFn` 传 `() => { cluster.selectedUpstreamKeys = []; cluster.selectedUpstream = null }`。
**理由**：遵循 AGENTS.md「删除流程统一用 useClusterUtils.ts 共享函数」；`clearSelectedFn` 在 refreshFn 之后调用，正好清空双状态。
**备选**：a) 仅参数化字段名 + 单独 label 参数 → 参数散落、易错配，否决；b) 为上游单独复制一套批量进度函数 → 代码重复，否决。

### D8: 确认弹窗名称列表
**决策**：批量删除确认弹窗标题组合选中上游名称——≤3 条全列，>3 条截断 + "等 N 条"。复用 `showDeleteConfirm` 的 `title` 字符串传参，不改弹窗组件。
**理由**：安全诉求（误删风险），名称可见 + 数量明确；改动最小。

### D9: 搜索/排序清除批量勾选（P3 决策落地）
**决策**：`loadUpstreams` 检测到搜索条件（`upstreamsSearch`/`upstreamsSearchField`）或排序条件（`upstreamsSortBy`/`upstreamsSortOrder`）变化时，清除 `selectedUpstreamKeys`（及 `selectedUpstream`）；`handleUpstreamTableChange` 排序分支显式清除。
**理由**：搜索/排序改变数据集，保留勾选会误删筛选结果之外的上游。与 D4"翻页保留"形成完整语义：**翻页保留、搜索/排序清除**。

### D10: 类型与状态初始化
**决策**：`frontend/src/types/index.ts` 的 `Cluster` 接口新增 `selectedUpstreamKeys?: number[]`（紧邻 `selectedUpstream`，镜像 line 76 `selectedRouteKeys`）；`frontend/src/views/CentralList.vue` 的 `loadClusters` cluster map 初始化 `selectedUpstreamKeys: []`。
**理由**：与路由批量（`selectedRouteKeys`）完全同构，向后兼容（可选字段）。

## Risks / Trade-offs

- [关联路由守卫在批量中误伤] → 前端"过滤跳过 + 提示"（非整体拦截），被引用上游剔除并 message.warning 列出；后端无条件守卫（与 delete_db/delete_edge 无关）兜底
- [前端守卫分页漏检（引用路由在第 2+ 页）] → 已知限制：前端懒加载仅第一页，尽力而为；后端全量查询 `Route.upstream_id == id` 是权威防线，进度弹窗展示后端 failed 原因
- [空 edge_uuid 静默发集合级 DELETE] → D6 守卫：批量 + **单删端点一并修复**，跳过并记 `skipped`（edge_client.py:312-315 空 resource_id → 集合级 DELETE）
- [批量循环 DB 异常导致 pending-rollback 拖垮整批] → D6：except 分支 `await db.rollback()`；**顺带修复路由批量 `delete_routes_batch` 同款 bug**
- [批量删除 Edge 同步失败] → 逐条 results 携带 error，进度弹窗标红提示"请手动清理"（现有 executeDeleteWithProgress 已处理）
- [勾选多行后单选按钮复活] → D1 补充：单选按钮可用性显式绑定批量状态，勾选 ≥2 强制禁用
- [搜索/排序后勾选残留误删] → D9：搜索/排序时清空勾选
- [跨页勾选残留：某上游在翻页/搜索后被后端删除] → 删除时后端逐条 404 计入失败；`clearSelectedFn` 删除成功后清空全量勾选
- [批量循环未捕获异常转 500] → D6：循环体 `except Exception` 穷尽捕获 + rollback
- [logBatchDeleteResults 硬编码"路由"影响上游文案] → D7：resourceKey 统一对象参数化（field/label/nameField），上游调用方传"上游"
- [SQLite async 无 FK cascade 导致关联行残留] → D6：手动删除 UpstreamTarget/ConfigVersion 行（与单删一致）

## Migration Plan

- 无数据库变更、无依赖新增
- 后端：新增端点 + schema，独立部署，旧端点不受影响
- 前端：types 新增字段（可选）+ CentralList 初始化默认值，向后兼容
- 回滚：删除端点回滚即恢复单删行为，前端 `selectedUpstreamKeys` 字段无副作用

## Open Questions

- ~~批量删除确认弹窗中 Edge 节点选择：沿用单删弹窗的节点多选还是仅"全部活跃节点"开关？~~ **已定**：沿用现有 `showDeleteConfirm` 弹窗节点多选（同一集群节点，D8），零改动
- ~~被路由引用的上游在批量中如何处理？~~ **已定**（D5）：前端"过滤跳过 + message.warning 提示"，仅未引用的进确认弹窗与请求；后端无条件守卫（与 delete_db/delete_edge 无关）双保险
- ~~前端守卫分页漏检如何兜底？~~ **已定**（D5）：前端尽力而为（懒加载第一页），后端全量查询是权威防线
- ~~勾选 ≥2 后点行行为？~~ **已定**（P2）：单选按钮随批量状态强制禁用
- ~~搜索/排序后批量勾选？~~ **已定**（P3）：翻页保留、搜索/排序清除（单选与批量统一语义）
- ~~空 edge_uuid 守卫？~~ **已定**（P4）：批量 + 单删端点一并修复，跳过并记 skipped
- ~~批量循环 DB 异常事务恢复？~~ **已定**（D6）：except 分支 `await db.rollback()`，顺带修复路由批量同款 bug
- ~~进度弹窗文案与请求体字段？~~ **已定**（D7）：resourceKey 统一对象（field/label/nameField/keys），路由与上游各自传入
