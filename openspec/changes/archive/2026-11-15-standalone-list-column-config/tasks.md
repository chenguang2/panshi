# standalone-list-column-config · tasks

## 1 弹窗接入

- [x] 1.1 `RouteList.vue` 工具条加入「列配置」弹窗（选择显示列 / 显示字段 / 搜索 / 拖宽提示 / 重置列宽），移除独立「重置列宽」按钮
- [x] 1.2 `UpstreamList.vue` 同上
- [x] 1.3 两页搜索框接 `searchVisible` 开关（`v-if`）

## 2 共享实现收敛

- [x] 2.1 两页 `orderedColumns` 改用 `resolveOrderedColumns`，删除各自的重排实现
- [x] 2.2 `visibleColumns` 走 `applyColumnWidths` + 显隐过滤
- [x] 2.3 `handleResetColumnWidths` 重置同时关闭弹窗

## 3 序号列语义

- [x] 3.1 三张独立列表页 `#` 列不进弹窗勾选项（`popoverColumns`）
- [x] 3.2 `visibleColumns` / `visibleNodeColumns` 兜底保留 `index`（antd CheckboxGroup 会剔除不在选项列表的值）

## 4 测试

- [x] 4.1 `UpstreamList.test.ts`：弹窗桩（a-popover / checkbox 组）+ 弹窗用例（勾选隐藏列、搜索开关、序号列不在选项、持久化）
- [x] 4.2 `RouteList.test.ts`：弹窗用例（勾选隐藏列、拖宽后弹窗内重置、搜索开关）
- [x] 4.3 `NodeList.test.ts`：列选用例改断言序号列恒展示
- [x] 4.4 全量 `npx vitest run --maxWorkers=4`：205 文件 / 2838 用例全绿；`npx vue-tsc -b` 通过

## 5 真机验收

- [x] 5.1 Playwright 1600×900 三页弹窗比对（标题/分区/勾选项/提示/按钮盒与配色一致）
- [x] 5.2 路由页：取消「方法」→ 列消失（`#` 保留）→ 刷新仍隐藏 → 恢复勾选即回归
- [x] 5.3 路由页：关闭「显示搜索框」→ 搜索输入消失，再开启恢复
- [x] 5.4 拖宽 URI 列后经弹窗「重置列宽」恢复 220
