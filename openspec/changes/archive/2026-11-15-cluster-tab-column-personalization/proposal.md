# Proposal

## Why

列宽拖拽与列移动已完成共享化并落地上游/路由两个独立列表页（`table-column-resize` / `table-column-order`），但统一管理页展开卡片内的集群 Tab 子表（节点/上游/路由）仍是旧表体：既没有调宽/移动手势，也没有表体竖线与横向滚动。同一个资源在两处行为不一致——用户在独立列表页能拖的列，在统一管理里拖不动，第一次尝试就会撞上体验断层。上一轮列个性化推广时该范围被显式列为 Non-Goals（"集群 Tab 子表后续另行立项"），本次即该项的立项。

## What Changes

- 统一管理页（`CentralList.vue` 展开卡片）内嵌的 **集群节点 / 集群上游 / 集群路由** 三张 Tab 子表获得与独立列表页同构的列个性化：表头右缘拖拽调宽（最小宽度下限）、表头标题拖拽移动（实时换位、源列高亮、Esc 取消）、全表内部竖线、内容完整宽呈现（横向滚动兜底）。
- 三张 Tab 子表的表体解剖对齐独立列表页：`table-layout: fixed` + `scroll.x = max-content` + 共享竖线类；否则列宽只是"建议值"、用户拖拽后会被内容撑开（表现为"拖了没用"）。
- 三张 Tab 子表的列配置弹窗补齐「重置列宽」入口（与独立列表页一致），重置只清本表宽度覆盖。
- **共享拖拽实现收紧为按表作用域**：统一管理页同屏可同时展开多张集群卡片，页面上会存在多张同类表格；当前实现用全文档选择器取表头几何，多表并存时会跨表串扰。改为以拖拽起点所在表格为几何作用域后，既有三页行为不变、Tab 子表才具备接入条件。
- 列偏好存储键保持隔离：Tab 子表继续用 `node` / `upstream` / `route`，独立列表页继续用 `*_standalone`，两处互不影响（本次**不**合并为同一偏好）。

非破坏性变更，无 API / 后端改动。

## Capabilities

### New Capabilities

（无新能力——列宽与列顺序能力已存在，本次是既有能力的适用范围扩展。）

### Modified Capabilities

- `table-column-resize`: 新增「集群 Tab 子表列宽个性化」需求——三张 Tab 子表的横向滚动/固定、拖拽调宽、宽度持久化与一键重置、竖线分隔。
- `table-column-order`: 新增「集群 Tab 子表列顺序个性化」需求——三张 Tab 子表的表头拖拽移动、实时换位、Esc 取消、拖拽不触碰排序。

## Impact

- 前端组件：`frontend/src/components`（无）、`frontend/src/views/clusters/ClusterNodes.vue`、`ClusterUpstreams.vue`、`ClusterRoutes.vue`（表体与表头接入）。
- 前端 composable：`frontend/src/composables/useColumnDragColumns.ts`（几何作用域收紧）、`useClusterNodes.ts` / `useClusterUpstreams.ts` / `useClusterRoutes.ts`（暴露列宽/列顺序读写与列重排计算结果）。
- 全局样式：`frontend/src/style.css`（`.grid-table` 复用，不新增规则族）。
- 测试：上述 composable 与三组件的组件测试、源码守卫测试（多表作用域、`headerCell` 接入、重置入口），以及统一管理页真机截图验收。
- 不受影响：后端、API、数据库、独立列表页的既有行为与存储键。
