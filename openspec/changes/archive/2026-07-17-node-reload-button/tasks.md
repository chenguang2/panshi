## 1. Backend — /restart 路由改名为 /reload

- [x] 1.1 将 `cluster_nodes.py` 中 `@router.post("/{cluster_id}/nodes/{node_id}/restart")` 改为 `/reload`，函数名和方法内逻辑不变

## 2. NodeList.vue 操作栏调整

- [x] 2.1 将"ⓘ 详情"按钮从操作栏行内移除（原来在启动/停止/状态之后）
- [x] 2.2 在操作栏行内"⏹ 停止"和"✓ 状态"之间新增"⟳ reload"按钮，调用 handleReload(record)
- [x] 2.3 在更多菜单的"编辑"上方新增"ⓘ 详情"菜单项，调用 viewDetail(record)

## 3. NodeList.vue 新增 handleReload 函数

- [x] 3.1 新增 handleReload(record) 函数，与 handleStart/handleStop 完全对称（executeAction + showConfirm），调用 `POST /clusters/{cluster_id}/nodes/{node_id}/reload`

## 4. ClusterNodes.vue 同步修改

- [x] 4.1 操作栏按钮组中"⏹ 停止"和"状态查询"之间新增"⟳ reload"按钮，调用 handleNodeReload
- [x] 4.2 新增 handleNodeReload 函数（与 handleNodeStart/handleNodeStop 模式一致）
