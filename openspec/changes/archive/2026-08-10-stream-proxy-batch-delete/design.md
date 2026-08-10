# Design: 四层代理卡片列表批量删除

## Context

四层代理页 `StreamProxyList.vue`（含普通 TCP/UDP/TLS 与 DNS 两种模式，由路由 query `type` 区分）以卡片网格展示，通过全局端点 `GET /stream-proxies?proxy_type=&page_size=` 加载。当前仅支持单删：`showDeleteConfirm` + `executeDeleteWithProgress` 调用 `DELETE /clusters/{cluster_id}/stream-proxies/{proxy_id}`（body: `DeleteClusterRequest{delete_db, delete_edge, node_ids}`）。

表格类页面（路由/上游/节点）已实现批量删除：选择状态挂 cluster 对象 + 工具栏常驻禁用按钮 + `showDeleteConfirm` + `executeDeleteWithProgress(resourceKey)`。后端批量端点已有 `delete_routes_batch` / `delete_upstreams_batch` / `delete_nodes_batch` 可参照。四层代理**无**批量端点。

## Goals / Non-Goals

**Goals:**
- 卡片页批量删除：批量管理模式 + 勾选 + 全选联动（toggle）+ 底部批量操作栏
- 后端批量删除端点，逐条独立处理
- 复用既有 `showDeleteConfirm` / `executeDeleteWithProgress` / `showBatchResultModal`，不重复实现进度弹窗
- 批量确认弹窗聚合展示将删除项（不做名称确认）

**Non-Goals:**
- 不改动单删流程与交互
- 不改动发布/版本管理
- 本次不做集群卡片页（`ClusterList` / `CentralList`）批量删除——四层代理先行，模式可后续复用
- 不做跨页跨分页的"全选所有页"（仅当前筛选结果/当前分组）

## Decisions

### D1: 批量管理模式（方案 B）而非常驻勾选（方案 A）
卡片本身是可点击容器（查看/编辑），常驻勾选框会与点击语义冲突。采用显式「批量管理」按钮切换模式：平时界面干净，进入模式后卡片浮现勾选框、卡片点击切换为选择而非进入详情。
- 页头右侧「批量管理」ghost 按钮，点击进入/退出
- 进入模式：卡片右上角圆形勾选框浮现（hover accent），点击卡片任意处或勾选框切换选中
- 选中视觉沿用项目既有 `.plugin-config-card.selected` 约定：accent 边框 + 浅色底
- 退出模式或删除完成：清空选择状态

### D2: 全选联动（方案 C），toggle 语义
筛选栏在批量模式下浮现两个链接：
- 「全选当前分组」：选中当前 `groupFilter` 下的全部可见卡片
- 「全选当前筛选结果」：选中 `displayedProxies` 全部
- **toggle**：若当前范围内全部已选中，再次点击则取消全选（用户补充要求）

### D3: 底部固定批量操作栏
`已选择 N 个 | 取消选择 | 批量删除 | 退出批量管理`。与 ClusterRoutes 的"常驻禁用+数量后缀"不同，这里操作栏仅在批量模式下浮现（NodeTaskCenter 哲学：低频操作隐藏化）。`批量删除` 未选中时禁用。

### D4: 选择状态放 composable，本地 ref
四层代理不挂 cluster 对象（无 CentralList 那样的父级持有者），在 `useStreamProxyList.ts` 中新增本地 ref：
- `batchMode: Ref<boolean>`
- `selectedProxyIds: Ref<number[]>`
- 计算属性 `selectedProxies`、`allGroupSelected`、`allFilteredSelected`（用于 toggle 判断）
- 排序/搜索/筛选变化时保持选择（按 id 过滤失效项）

### D5: 批量确认弹窗——复用 showDeleteConfirm，去掉名称确认
调用现有 `showDeleteConfirm`（聚合标题 + 数据库/Edge 双 checkbox）。四层代理单删本就无名称确认步骤，批量自然满足"不做名称确认"。确认后走 `executeDeleteWithProgress`：
- `apiEndpoint: /stream-proxies`（全局批量端点，**修正 V3**：原 D5 误写为按集群路径，统一以 D6 为准）
- `resourceKey: { field: 'proxy_ids', label: '四层代理', nameField: 'name', keys: selectedProxyIds }`
- `refreshFn: loadProxies`、`clearSelectedFn: 清空选中并退出批量模式`

**跨集群 Edge 节点选择（讨论确认 V1-A）**：`showDeleteConfirm` 的节点选择 UI 是单集群语义，跨集群批量无法逐节点表达。批量确认弹窗**不展示逐节点 checkbox**，勾选「删除 Edge 节点」即删除各集群全部在线节点上的配置（`get_active_nodes(cluster_id, db, None)` 语义）。弹窗文案写明"将删除所有在线节点上的配置"。若未来需要逐节点粒度，再升级为按集群分组选节点（方案 C）。

### D6: 后端批量端点——全局批量，覆盖 normal 与 dns（V2 修订）
全局列表 `GET /stream-proxies` 返回跨集群数据。采用**全局批量端点**：
- `DELETE /stream-proxies`（`global_router`，前缀 `/stream-proxies`）
- body: `BatchDeleteStreamProxiesRequest{ proxy_ids: List[int], delete_db, delete_edge, node_ids? }`（继承 `DeleteClusterRequest`）
- **覆盖 normal 与 dns 两类代理（修订 V2）**：DNS 与普通代理同属 `ps_stream_proxy` 表（`proxy_type` 字段区分），列表端点 `GET /stream-proxies?proxy_type=` 已支持两类。批量端点**不按 proxy_type 过滤**——按 id 精确删除，天然同时服务四层代理页（normal）与 DNS 代理页（dns）；不存在的 id 标记失败。前端两个页面均调用同一批量端点
- 处理逻辑：按 `proxy.cluster_id` 分组，每组复用现有单删逻辑（`delete_stream_proxy` 内部流程），逐条独立处理，单条失败不阻塞其余
- **node_ids 语义（V6）**：批量场景 node_ids 传空 = 删除各集群全部在线节点（不传 node_ids 字段）；传值则按 id 过滤。确认弹窗文案明确"全部在线节点"
- 返回结构（**修正 V4**，对齐 `logBatchDeleteResults`）：
  ```
  { message, results: [{ proxy_id, name, status, results: [...] }] }
  ```
  其中 `name` 为代理名称（前端 `nameField: 'name'` 读取），成功条目含单删 results，失败条目含 `status: "failed"` + `message`
- **部分失败语义（V5）**：单条失败返回 `status: "failed"` 于 results 条目，不抛 HTTPException 中断整体；`logBatchDeleteResults` 已兼容该判定（`r.status === 'failed' || r.results.some(sub => sub.status === 'failed')`）
- 前端 `executeDeleteWithProgress` 的 `resourceKey` 批量模式直接调 `DELETE /stream-proxies` 一次完成

### D7: 前端编排
`executeDeleteWithProgress` 支持 `apiEndpoint` 为全局路径即可（`DELETE /stream-proxies`）。复用其 `logBatchDeleteResults` 逐条解析。无需新写进度逻辑。

### D8: 全选与选择状态细节（V7/V8/V9）
- **全选范围（V7）**：「全选当前筛选结果」= 当前已加载的 `displayedProxies`（`PAGE_SIZE_CARD_GRID=500` 上限，不做跨页全选）；批量操作栏提示"已选择 N 个"即可，不做页内/页外区分文案
- **已选解析快照（V8）**：`selectedProxyIds` 为 id 集合；确认弹窗与计数基于**原始 `proxies` 数组**解析（非当前筛选视图），筛选/搜索变化后已选 id 仍可列出与删除
- **全选分组边界（V9）**：`groupFilter === '__all__'` 时隐藏「全选当前分组」，仅显示「全选当前筛选结果」；其他分组值时两者均显示

## Risks / Trade-offs

- **跨集群一致性**：全局批量端点需在事务/逐条层面处理多集群；采用与 `delete_routes_batch` 一致的逐条独立模式，不强求跨集群原子性（单条失败记录结果，其余继续）。
- **选择状态与筛选联动**：筛选/搜索变化后已选 id 可能不再可见——按 id 保留选中（与 ClusterRoutes 的 `preserveSelectedRowKeys` 语义一致），确认弹窗仍列出全部已选（基于原始 proxies 快照，V8）。
- **Edge 节点粒度**：批量删除 Edge 选项为"全部在线节点"粒度（V1-A），无法逐节点选择——接受此 trade-off，批量场景通常为整体清理；如需逐节点粒度后续升级方案 C。
- **DNS 类型隔离**：后端批量端点仅处理 `proxy_type == "normal"`（V2-A），DNS 代理不走批量端点；传入 DNS id 标记失败，防误删。
- **全选 toggle 边界**：分组全选与筛选全选范围不同，两者独立计算全选状态；切换分组时分组全选状态重置；`groupFilter == __all__` 时隐藏全选分组（V9）。
- **分页上限**：全选范围 = 当前已加载数据（`PAGE_SIZE_CARD_GRID=500`），不做跨页全选（V7）。
- **权限**：沿用现有端点鉴权，无新增权限维度。
