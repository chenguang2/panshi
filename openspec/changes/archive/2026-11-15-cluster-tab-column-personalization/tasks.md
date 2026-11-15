# Tasks

## 1. 共享层：列重排/宽度 helper 与拖拽作用域收紧

- [x] 1.1 `useColumnConfig.ts` 导出纯函数 `resolveOrderedColumns(columns, order)`（按存储顺序重排，未知/重复 key 剔除，缺失 key 按默认序补位）与 `applyColumnWidths(columns, widths)`（逐列覆盖 width，无覆盖保持原档）。验证：`composables/__tests__/useColumnConfig.test.ts` 新增用例先红后绿（乱序/缺键/新增列/空存储四种形态）。
- [x] 1.2 `useColumnDragColumns.ts` 手势作用域收紧：`startColumnMove` 以 `e.currentTarget.closest('.ant-table-wrapper')` 解析本次拖拽表格根，矩形采集/FLIP/收尾清理全部限定该根，`tableSelector` 降级为兜底。验证：新增 `composables/__tests__/useColumnDragColumns.test.ts`——同文档两张表时，对表 A 拖拽只以表 A 的 th 几何判定落点（表 B 同行列不参与），先红后绿；既有 NodeList/UpstreamList/RouteList 组件测试全绿。

## 2. 集群节点子表接入

- [x] 2.1 `useClusterNodes.ts`：暴露 `nodeColumnWidths`/`setNodeColumnWidth`/`resetNodeColumnWidths`/`nodeColumnOrder`/`setNodeColumnOrder`，`visibleNodeColumns` 改为经 1.1 helper 重排 + 宽度覆盖；`allNodeColumns` 逐列补默认宽度档。验证：`useClusterNodes.test.ts` 新增「顺序生效 / 宽度覆盖 / 未知 key 剔除」用例先红后绿。
- [x] 2.2 `ClusterNodes.vue` 表体解剖对齐 + 手势接入：`class="node-table grid-table"`、`:scroll="{ x: 'max-content' }"`、`:table-layout="'fixed'"`、`#headerCell` 槽（wrap 类 + 右缘手柄，`#`/`ip`/`actions` 不可移动/无手柄），接 `useColumnDragColumns`（`fixedKeys: ['ip','actions']`）。验证：`views/clusters/__tests__/ClusterNodes.source.test.ts` 补源码守卫（grid-table 类、scroll/tableLayout 属性、headerCell 槽、composable 接线）先红后绿。
- [x] 2.3 列配置 popover 追加「重置列宽」入口：清空本表 `widths` 并关闭 popover，提示文案与独立列表页一致。验证：`ClusterNodes.test.ts` 新增用例——写入非空 widths 后点击重置，宽度恢复默认档且 localStorage 中该 key 的 `widths` 为空。

## 3. 集群上游子表接入

- [x] 3.1 `useClusterUpstreams.ts`：同 2.1（顺序/宽度/重置读写暴露 + 默认宽度档 + helper 消费）。验证：`useClusterUpstreams.test.ts` 新增顺序/宽度用例先红后绿。
- [x] 3.2 `ClusterUpstreams.vue`：同 2.2（表体解剖 + `fixedKeys: ['name','actions']` + headerCell 槽）。验证：`ClusterUpstreams.test.ts` 新增断言（列顺序生效、拖拽移动后 `sorter` 状态未变、手柄不外露于 name/actions）先红后绿。
- [x] 3.3 popover 追加「重置列宽」。验证：组件用例断言重置后宽度回默认且不影响 `node`/`route` 键。

## 4. 集群路由子表接入

- [x] 4.1 `useClusterRoutes.ts`：同 2.1（10 列含 `广级匹配`/`描述` 等无宽列补档）。验证：`useClusterRoutes.test.ts` 新增顺序/宽度用例先红后绿。
- [x] 4.2 `ClusterRoutes.vue`：同 2.2（`fixedKeys: ['name','actions']`）。验证：`ClusterRoutes.test.ts` 新增断言（顺序生效、拖拽不触发排序、固定列无手柄）先红后绿。
- [x] 4.3 popover 追加「重置列宽」。验证：组件用例断言重置行为与其它键隔离。

## 5. 集成与真机验收

- [x] 5.1 `npx vue-tsc -b` 零错误；`npx vitest run --maxWorkers=4` 无新增失败（失败集逐轮轮换时按隔离复跑定性，#58）。验证：两命令输出留档。
- [x] 5.2 统一管理页真机（Playwright，连已运行实例 localhost:12345）验收：展开卡片与最大化两形态下分别验证——节点/上游/路由子表拖宽并刷新保持、拖拽移动列（含 Esc 取消）、路由表头拖拽不触发排序、「重置列宽」生效、同屏展开两张卡片时手势只作用于被拖的表。截图留档。验证：脚本断言全 PASS + 截图人工复核。
  > 实测记录（2026-11-15，真机 localhost:12345 / 19 项断言全 PASS，截图 /tmp/opencode/column-accept/*.png）：
  > 节点（调宽 IP +106px 并刷新保持、拖「状态」前移到 Edge版本 之前、重置列宽回拖前基线 194px）、
  > 上游（调宽 185→260、拖拽中途实时换位、Esc 恢复拖前顺序）、路由（拖「优先级」到 URI 前、表头拖拽无 sorter 高亮且零排序请求）、
  > 三表存储键 node_cfg_1 / upstream_cfg_1 / route_cfg_1 互不串写。
  > **形态说明**：当前统一管理页只有「最大化」入口可达（`CentralList.toggleExpand` 函数存在但模板无任何消费点，
  > 故「非最大化展开卡片」与「同屏并存两张卡片」两形态在现 UI 不可达——同一时刻最多一张展开表）。
  > 多表作用域的守卫由 1.2 的 `useColumnDragColumns.test.ts`（同文档两张表几何隔离）覆盖，未做真机多卡验证。
