# Design：表格序号列解剖统一

## Context

upstream-list-index-column 落地时确立了序号列目标形态，并把 AuditLog width 56 与 UserList `currentPage` 记为观察项。本变更收编两处漂移。全部断言已落码核验（2026-10-19）：

| 位置 | width | 计数公式 | 分页 | 判定 |
|---|---|---|---|---|
| edgeColumns.ts（EdgeClient 8 表） | 45 | `index + 1` | `:pagination="false"` ×8 | 正确（无分页=全量，页内即连续） |
| NodeList.vue:850 | 45 | 跨页连续 | 后端分页 | 目标形态 |
| RouteList.vue:292 | 45 | 跨页连续 | 后端分页 | 目标形态 |
| UpstreamList.vue:204 | 45 | 跨页连续 | 后端分页 | 目标形态 |
| UserList.vue:388 | 45 | 跨页连续（`currentPage`） | 后端分页 | 宽度对，命名漂移 |
| AuditLog.vue:232 | **56** | 跨页连续 | 后端分页 | **唯一宽度漂移** |

## Goals / Non-Goals

- Goals：序号列解剖单一定义（宽度/公式/位置），命名统一；规范落到 spec 防再漂移。
- Non-Goals：不改 EdgeClient 页内编号公式（已正确）；不引入共享序号列组件/工厂（见 D1）；不动各页列定义结构。

## Decisions

### D1. 不抽象共享「序号列」组件或工厂——以 spec + 测试钉住约定

序号列本体只有 1 行模板 + 1 行列定义，抽象成共享组件反而制造间接层（同 upstream-list-index-column D1 判据：4 行同构代码的抽象 ROI 为负）。统一靠：① spec 规范（新能力 `table-anatomy`）；② 本变更补的列定义钉住测试；③ AGENTS.md 一行约定。未来新表格照规范抄。

### D2. AuditLog 宽度对齐 45，以列定义断言钉住

AuditLog.test.ts 既有桩转发 columns prop（:24 定制桩），无既有列断言。新增 1 用例断言 `props('columns')` 首列为 `{ title: '#', key: 'index', width: 45 }`——宽度是本次交付物，直接断言列定义对象（不渲染 DOM 量像素）。

### D3. UserList 对齐「模板内联调工厂」主流形态，既有分页测试即回归证据

四页主流形态核验（2026-10-19）：RouteList/NodeList/AuditLog/UpstreamList 均为模板内联 `:pagination="paginationProps({ page, pageSize, total… }, '单位')"`、无中间 computed；UserList 独有薄 computed `paginationProps` 包装别名 `buildTablePagination`（:381-383，无任何附加逻辑）。统一为内联形态：删除薄 computed、导入改直名、模板 :49 改内联调用（同四页字面形态）+ `currentPage → page`（6 处引用）。零行为变化：`UserList.pagination.test.ts` 的 3 个既有用例（初始请求带 page/page_size、total 来自后端、翻页触发新请求）就是行为不变的回归证据，不新增用例。若 `TablePaginationConfig` 导入因此闲置，一并移除（vue-tsc unused 兜底）。风险点是模板 :58 的公式引用——vue-tsc 会兜住漏改。

**评审补审（2026-10-19，重命名安全性核验记录）**：① `page` 标识符在 UserList **空闲**（排除 currentPage/pageSize/page_size/page-header 后零占用），重命名无碰撞；② UserList 无路由 query 同步（无 useRoute/router.push 的分页联动），页码纯内部状态，重命名零外溢；③ `computed` 在 UserList 另有 4 处使用（导入保留），仅 `TablePaginationConfig` 类型导入可能闲置；④ 测试桩已注册 `columns`/`pagination` props（UserList.pagination.test.ts:71），断言机制可行。

### D4. `index+1` 的合法边界写进 spec，防止未来「顺手统一」改坏 EdgeClient

`index + 1` 页内编号仅在 `:pagination="false"` 时合法（无分页=表格渲染全量数据，页内序号即全量序号）；后端分页表格必须用跨页连续公式。这条边界不写下来，下一个「统一命名/公式」的会话就可能把 EdgeClient 改坏（把全量语义换成对不齐的页内语义）。

### D5. 源码守卫机械化拦漂移——正则扫列定义断言 width 一律 45

单点组件断言（D2）只钉住 AuditLog，未来新表格抄错宽度仍无人拦。新增 `tableAnatomy.source.test.ts`：正则 `title: '#', key: 'index', width: (\d+)` 扫 `views/**/*.vue` + `utils/edgeColumns.ts`，断言全部捕获组 === '45'，并断言扫到 ≥13 处（现量 5 页 + 8 张 EdgeClient 表，防止扫描目标静默消失变空守卫）。列定义格式经 prettier 统一（无分号/单引号/固定宽），正则可靠；守卫只管宽度这一个已定维度，不碰公式形态（模板层公式形态多样，正则化会脆）。先例：clusterNodesFullFetch.source.test.ts / ClusterCard.source.test.ts。

## Risks / Trade-offs

- 重命名触碰模板插值 → 漏改由 `vue-tsc -b` 兜底（约定 #27）。
- 无。

## Migration Plan

1. RED：AuditLog.test.ts 补列定义断言（失败：56 ≠ 45）。
2. GREEN：AuditLog width 45；UserList 重命名（机械）。
3. 回归：AuditLog + UserList.pagination + UserList 既有测试全绿；`vue-tsc -b` 0。
4. spec `table-anatomy` + AGENTS.md 约定落档。
