## 1. 后端：批量删除 Schema 与端点

- [x] 1.1 在 `backend/app/schemas/cluster.py` 新增 `BatchDeleteStreamProxiesRequest(DeleteClusterRequest)`：`proxy_ids: List[int] = Field(...)`（不设 min_length=1，空列表由端点显式 400，与 `BatchDeleteRoutesRequest` 注释语义一致）
- [x] 1.2 在 `backend/app/api/v1/cluster_stream_proxies.py` 的 `global_router` 新增 `DELETE ""` 端点 `delete_stream_proxies_batch`：body 为 `BatchDeleteStreamProxiesRequest`；`proxy_ids` 为空返回 400「请至少选择一个四层代理」；`delete_db` 与 `delete_edge` 均 False 返回 400「请至少选择一项：数据库 或 Edge 节点」
- [x] 1.3 批量处理逻辑：查询 proxy 记录 `WHERE id IN proxy_ids AND proxy_type == "normal"`（**V2-A**：仅普通四层代理）；非 normal/不存在的 id 直接标记失败条目 `{"proxy_id", "name", "status": "failed", "message": "代理不存在或类型不支持"}`；按 `cluster_id` 分组，每组复用单删逻辑（edge 删除经 `edge_sync.delete_on_nodes` + `_delete_proxy_versions` + DB delete），逐条独立处理（**V5**：单条异常捕获后标记 `status: "failed"`，不抛 HTTPException，不阻塞其余）
- [x] 1.4 **V6**：`node_ids` 为空且 `delete_edge=True` 时，对每个集群调用 `get_active_nodes(cluster_id, db, None)`（全部在线节点）；`node_ids` 有值时按 id 过滤
- [x] 1.5 返回 `{"message": "四层代理批量删除完成", "results": [{proxy_id, name, status, results}]}`（**V4**：字段为 `name` 非 `proxy_name`，对齐前端 `nameField`；成功条目含单删 results，失败条目含 message）

## 2. 后端：pytest 测试

- [x] 2.1 在 `backend/tests/` 新增批量删除端点测试：`DELETE /stream-proxies` 批量删除成功（数据库记录删除 + 版本历史清理）
- [x] 2.2 测试：空 `proxy_ids` 返回 400；`delete_db`/`delete_edge` 均 False 返回 400；混合成功/失败场景（部分 proxy 不存在或为 DNS 类型时标记失败、其余 normal 仍删除、返回 results 逐条状态）——验证 **V2-A/V4/V5**
- [x] 2.3 测试：删除 Edge 选项（**V6**）——`node_ids` 为空时对各集群全部在线节点调用 Edge 删除；`node_ids` 有值时仅对指定节点调用

## 3. 前端：useStreamProxyList 选择状态

- [x] 3.1 在 `frontend/src/composables/useStreamProxyList.ts` 新增 `batchMode: Ref<boolean>` 与 `selectedProxyIds: Ref<number[]>`
- [x] 3.2 新增计算属性：`selectedProxies`（按 id 从**原始 proxies 数组**解析，**V8**：不随筛选视图变化）、`allGroupSelected` / `allFilteredSelected`（当前分组/当前已加载结果是否全部选中，用于 toggle 判断）、`groupProxies` / `filteredProxies`（当前范围内 id 列表）
- [x] 3.3 新增函数：`toggleBatchMode()`（进入/退出并清空选择）、`toggleProxy(id)`、`toggleSelectAllGroup()`、`toggleSelectAllFiltered()`（toggle 语义：范围内全部已选则清空，否则全选）、`clearSelection()`
- [x] 3.4 筛选/搜索变化时按 id 保留已选（不主动清空；确认弹窗与计数基于原始 proxies 解析，**V8**）
- [x] 3.5 **V9**：`groupFilter === '__all__'` 时 `showGroupSelectAll` 计算属性为 false（隐藏「全选当前分组」）

## 4. 前端：StreamProxyList.vue 批量管理 UI

- [x] 4.1 页头「批量管理」ghost 按钮（`PageHeader #actions`，在「+ 新建四层代理」左侧），点击 `toggleBatchMode`；批量模式下文案切换为「退出批量管理」
- [x] 4.2 卡片右上角圆形勾选框：批量模式浮现（flex 子元素置于 `sp-card-topbar` 右侧，垂直居中，避免 absolute 重叠），选中显示 ✓；卡片 `:class="{ selected: selectedProxyIds.includes(p.id) }"`，样式沿用 `.plugin-config-card.selected` 约定（accent 边框 + 浅色底）
- [x] 4.3 批量模式下卡片点击切换为选择（`@click` 在批量模式走 toggleProxy，正常模式保持原查看/编辑行为——卡片内按钮 `@click.stop`）
- [x] 4.4 筛选栏（`sp-header-actions`）批量模式下浮现「全选当前分组」「全选当前筛选结果」链接，绑定 `toggleSelectAllGroup` / `toggleSelectAllFiltered`，文本随全选状态切换「全选」/「取消全选」；**V9**：`groupFilter === '__all__'` 时隐藏「全选当前分组」（`v-if="showGroupSelectAll"`）；**V7**：「全选当前筛选结果」范围 = 当前已加载的 `displayedProxies`
- [x] 4.5 底部固定批量操作栏（`position: fixed; bottom: 0`）：`已选择 N 个 | 取消选择 | 批量删除(禁用当 N=0) | 退出批量管理`；列表容器批量模式下预留底部间距（如 `padding-bottom: 80px`）避免遮挡；计数基于 `selectedProxies.length`（原始列表解析，V8）
- [x] 4.6 批量删除编排：`showDeleteConfirm`（聚合标题列出 N 个名称前 3 + "等 N 个"，`apiEndpoint: '/stream-proxies'`，**V3**：全局路径；**V1-A**：确认弹窗不传 `nodes` 参数（不显示逐节点选择），「删除 Edge 节点」文案明示"将删除各集群全部在线节点上的配置"；`onOk` → `executeDeleteWithProgress`（`resourceKey: { field: 'proxy_ids', label: '四层代理', nameField: 'name', keys: selectedProxyIds }`、`refreshFn: loadProxies`、`clearSelectedFn: 清空并退出批量模式`））

## 5. 前端：Vitest 测试

- [x] 5.1 `useStreamProxyList` 测试：`toggleProxy` 增删 id、`batchMode` 切换清空选择、`toggleSelectAllGroup` / `toggleSelectAllFiltered` 全选与再点取消（toggle）、筛选变化保留已选 id（V8）、`groupFilter === '__all__'` 时 `showGroupSelectAll` 为 false（V9）
- [x] 5.2 `StreamProxyList.vue` 组件测试：批量模式勾选框浮现、卡片选中 class、底部操作栏计数、批量删除按钮禁用态、（可 mock `showDeleteConfirm`/`executeDeleteWithProgress` 验证编排参数含 `proxy_ids`、`apiEndpoint: '/stream-proxies'`、未传 `nodes`）

## 6. 验证

- [x] 6.1 `cd backend && uv run pytest`（新增批量端点测试通过，无回归）
- [x] 6.2 `cd frontend && npx vitest run`（新增 composable/组件测试通过）
- [x] 6.3 `cd frontend && npm run build`（TypeScript 编译通过，无 `as any`/`@ts-ignore`）
- [x] 6.4 手动链路：连接 `http://localhost:12345`，四层代理页批量管理模式勾选多个 → 批量删除 → 进度弹窗逐条反馈 → 列表刷新；验证「全选当前筛选结果」toggle、分组全选在 `__all__` 时隐藏（V9）、删除 Edge 勾选时弹窗文案提示"全部在线节点"（V1-A）
