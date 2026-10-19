# Tasks：表格序号列解剖统一

## 1. AuditLog 宽度对齐

- [x] 1.1 RED：`AuditLog.test.ts` 新增列定义断言用例——挂载后断言表格桩 `props('columns')` 首列为 `{ title: '#', key: 'index', width: 45 }`（当前 56，用例先红）。
- [x] 1.2 GREEN：`AuditLog.vue:232` `width: 56` → `width: 45`。
- [x] 1.3 回归：`npx vitest run src/views/__tests__/AuditLog.test.ts --no-file-parallelism` 全绿。

## 2. UserList 命名统一

- [x] 2.1 对齐主流形态：`UserList.vue` ① `currentPage` → `page`（:58/:376/:382/:418/:424/:837 六处）；② 删除薄 computed `paginationProps`（:381-383，纯工厂包装无附加逻辑），模板 :49 改内联 `:pagination="paginationProps({ page, pageSize, total: totalCount }, '个用户')"`（RouteList/NodeList/AuditLog/UpstreamList 四页同款字面形态，已核验）；③ 导入改直名 `import { paginationProps } from '@/composables/usePagination'`（:338），闲置的 `computed`/`TablePaginationConfig` 导入一并清理。
- [x] 2.2 回归：`npx vitest run src/views/__tests__/UserList.pagination.test.ts --no-file-parallelism` 全绿（零行为变化的回归证据；该文件是 UserList 唯一测试文件，无 UserList.test.ts）。

## 3. 收口

- [x] 3.1 源码守卫（RED 先于 AuditLog 修复亦可，与 1.1 同为红→绿）：新增 `src/views/__tests__/tableAnatomy.source.test.ts`——读 `views/**/*.vue` 与 `utils/edgeColumns.ts` 源码，正则捕获 `title: '#', key: 'index', width: (\d+)` 全部列定义，断言宽度一律 45 且命中数 ≥13（5 页 + 8 张 EdgeClient 表，防空守卫）。实现 AuditLog width 45 后该守卫与 1.1 一同转绿。
- [x] 3.2 `npx vue-tsc -b` 0 错误。
- [x] 3.3 AGENTS.md 关键约定补一行：表格序号列解剖见 `openspec/specs/table-anatomy/spec.md`（width 45、后端分页跨页连续公式、`index+1` 仅限 `:pagination="false"`）。
- [x] 3.4 实页目检（Playwright/12345）：审计日志页序号列宽与路由管理页并排一致（45px 窄列）；用户管理页翻页计数连续不回归。验收后清理测试状态。

## Verification

- 全部测试证据复跑属实后才可勾任务；触碰文件跑单测 + `vue-tsc -b`（约定 #27）。
