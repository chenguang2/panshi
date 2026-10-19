# Design: upstream-list-index-column

## Context

UpstreamList 独立页为标准表格式列表（a-table + 内置 pagination + `usePagination.paginationProps`，约定 54 体系内），分页变量为组件内 `page` / `pageSize` ref（UpstreamList.vue:165-166），与 RouteList 完全同构。列定义为组件内静态数组 `columns`（UpstreamList.vue:200-208），首列为「名称」。

参照实现（RouteList.vue，已验收）：

```
列定义：{ title: '#', key: 'index', width: 45 }   // 首列
渲染：  <template v-if="column.key === 'index'">
          <span class="text-muted">{{ (page - 1) * pageSize + index + 1 }}</span>
        </template>
```

同款已存在于：RouteList / NodeList / UserList（width 45、text-muted、跨页连续计数）、AuditLog（width 56，历史漂移）、EdgeClient（8 表）。

## Goals / Non-Goals

- Goals: 上游独立页表格解剖与其余资源独立页对齐；跨页连续计数语义一致（第 2 页首行 = pageSize+1）
- Non-Goals: Tab 面板内表格加序号列（用户裁决方案 1）；AuditLog width 对齐；列配置弹窗集成（独立页列数组本就不在列配置体系内）

## Decisions

### D1: 完全照抄 RouteList 模式，不抽象共享组件

四处独立页的序号列实现是 4 行同构代码（列定义 1 行 + bodyCell 2 行）。抽象成共享列工厂的收益（防再漂移）与成本（新共享面 + 四页回改）不成比例；且 AGENTS.md 约定 11 的判据（LLM 会话读取原子单位）下，各页列数组本就是页内自包含定义。**以测试钉住替代抽象**：UpstreamList 断言写死后，若未来再漂移由测试拦截。

### D2: 测试桩策略（已核验）

UpstreamList.test.ts 的桩 = 共享 `aTableStub` 扩展（spread + 模板 replace 补空态行），实测共享桩原生转发 bodyCell 槽且带 `:index`（aTableStub.ts:89）——序号列渲染断言零桩改动。共享桩不渲染表头 th，「首列为 #」不做表头断言，以**行级渲染断言传递钉住**：`column.key === 'index'` 分支只在列定义存在时触发，断言首行序号文本「1」（第 2 页「21」）即同时钉住列定义与计数公式。不给桩补 thead（桩越复杂越成假绿温床，约定 57 教训）；**禁止**为迁就桩改产品代码槽名，断言后实页目检兜底。

### D3: 计数公式取组件现有分页变量

`(page - 1) * pageSize + index + 1` 中的 `page`/`pageSize` 直接引用组件内既有 ref（165-166 行），不新增状态。UpstreamList 独立页列**无 sorter**（服务端排序是路由页交付，上游页没有），但页面有**集群/负载均衡两个筛选下拉**（`clusterFilter`/`lbFilter`）——序号语义 = 当前筛选视图行序 + 页偏移（筛选后从 1 起重排，翻页偏移按筛选后总数计算，与 RouteList 筛选语义一致）。

## Risks / Trade-offs

- 极低：纯展示列，无事件、无数据依赖；唯一风险是桩与真实组件槽名分歧导致假绿（D2 以共享桩 + 实页目检双兜底）

## Migration Plan

1. RED：UpstreamList 测试断言首列为 # 序号列 + 第 2 页首行计数（预期失败）
2. GREEN：columns 首列 + bodyCell 槽
3. 回归：UpstreamList.test.ts 全绿 + `npx vue-tsc -b` 0 + 实页目检（12345 实例上游页截图）
