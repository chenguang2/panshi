# 表格序号列解剖统一（AuditLog 宽度 / UserList 命名漂移）

## Why

全站表格页的 `#` 序号列在 upstream-list-index-column 变更中确认了目标形态（首列、`title: '#'`、width 45、后端分页跨页连续计数），但存量代码尚有两处漂移，均为 upstream-list-index-column 提案中记录的观察项，本次收编：

1. **AuditLog 序号列 width 56**——全仓其余 11 处序号列（NodeList/RouteList/UpstreamList/UserList + edgeColumns.ts 8 张 EdgeClient 表）均为 45，审计日志是唯一漂移点，同一表格解剖维度出现两种列宽。
2. **UserList 计数公式变量命名漂移**——分页页码 ref 命名 `currentPage`（UserList.vue:376）并给 `paginationProps` 工厂起了本地别名 `buildTablePagination`（:338），而其余四页均为 `page` + 直名导入。语义完全相同（单点工厂 `usePagination.paginationProps` 的消费方），纯命名漂移，且是「同机制不同名」的又一实例。

## What Changes

- **AuditLog.vue**：序号列 `width: 56` → `width: 45`（1 行）；补列定义钉住测试（首列 `{ title: '#', key: 'index', width: 45 }`）。
- **UserList.vue**：`currentPage` ref 重命名为 `page`（6 处引用：:58/:376/:382/:418/:424/:837）；`import { paginationProps as buildTablePagination }` 别名改为直名导入（:338 + :381/:49 消费点）。纯机械重命名，零行为变化，由既有 `UserList.pagination.test.ts` 3 用例作回归证据。
- **新能力 spec `table-anatomy`**：把序号列解剖定为规范——首列位置、`title: '#'`、width 45、后端分页跨页连续公式 `(page-1)*pageSize+index+1`；**`index+1` 页内编号仅在 `:pagination="false"`（无分页=全量）时合法**（EdgeClient 8 表即此形态，已核验正确、明确不动）；45px 对 4 位序号实测无裁切，≥5 位深翻页视觉溢出记为 accepted residual。
- **源码守卫 `tableAnatomy.source.test.ts`**：正则扫 `views/**/*.vue` + `utils/edgeColumns.ts` 全部 `title: '#', key: 'index', width: N` 列定义，断言 N 一律 45——机械化拦住未来新表格抄错宽度（先例：clusterNodesFullFetch / ClusterCard 源码守卫）。
- **AGENTS.md** 补一行约定指向该规范（规则 #13：防未来会话再各写各的）。

## Impact

- **Affected specs**: 新增 `specs/table-anatomy/spec.md`（本变更前无表格解剖规范）
- **Affected code**:
  - `frontend/src/views/AuditLog.vue`（1 行列定义）
  - `frontend/src/views/UserList.vue`（重命名，约 8 行）
  - `frontend/src/views/__tests__/AuditLog.test.ts`（补 1 个列定义断言用例）
  - `frontend/src/views/__tests__/tableAnatomy.source.test.ts`（新增源码守卫）
  - `AGENTS.md`（1 行约定）
- **明确不动**（已核验正确）：EdgeClient 8 表 `index+1` + `:pagination="false"`；NodeList/RouteList/UpstreamList 序号列（已是目标形态）；各页 `pageSize` ref（本就同名）。
- 零后端改动；无 schema/写库路径触碰，无需 PG 方言冒烟。
