# Proposal: upstream-list-index-column

## Why

用户一致性审查发现：表格式列表页中，用户管理（UserList）、节点管理（NodeList）、路由管理（RouteList）、审计日志（AuditLog）、Edge 客户端（8 张表）的第一列均为「#」序号列，**唯独上游管理独立页（UpstreamList）没有**——列数组首列直接是「名称」。排查结论：无任何设计理由，纯属历史漂移（序号列是各页零散加的，从未统一机制；AuditLog 的 width 56 与其他页的 45 也随之漂移）。序号列是表格解剖的一致性维度（跨页引用定位「第 N 条」、行数感知），与已落地的「全站列表分页统一标准」（AGENTS.md 约定 54）同属表格形态收敛。

## What Changes

**方案 1（用户裁决，最小一致）**：UpstreamList 独立页补「#」序号列——照抄 RouteList 同款实现：

- 列定义首列加 `{ title: '#', key: 'index', width: 45 }`
- bodyCell 槽渲染跨页连续计数 `{{ (page - 1) * pageSize + index + 1 }}`（与 RouteList/NodeList/UserList 完全同款）
- 落地后四个资源独立页（用户/节点/路由/上游）表格解剖对齐

**明确不做**（方案 1 vs 方案 2 的裁决边界）：

- Tab 面板内路由/上游表**不加**序号列：面板宽度紧凑、行数少、已有行选中高亮承担定位，且 Tab 列走「列配置」可选体系（`columnsSelected` 默认集），加列改动面与收益不成比例
- 卡片网格页（SSL/插件组/插件元数据/全局规则/静态资源/流代理/DNS）无表格，不适用
- AuditLog 序号列 width 56 → 45 的对齐属同型漂移观察项，**暂不纳入本变更**（避免捆绑扩面，如需另行裁决）

## Impact

- **Specs**: 新增能力 `upstream-list-page`（ADDED：序号列需求——首列展示 + 跨页连续计数）
- **Code**: 仅 `frontend/src/views/UpstreamList.vue`（columns 数组 + bodyCell 槽两处，约 4 行）；零后端改动
- **测试**: `UpstreamList.test.ts` 补行级渲染断言（第 1 页首行「1」、翻第 2 页首行「21」——行级断言传递钉住列定义，因共享 aTableStub 不渲染表头 th）；已核验该文件桩 = 共享 aTableStub 扩展，bodyCell 槽原生转发且带 `:index`（aTableStub.ts:89），槽渲染零阻力（桩与真实组件槽名分歧前科见 AGENTS.md 约定 57）
- **风险**: 纯前端展示列，无写库路径，无需 PG 方言冒烟
- **Out of scope**: Tab 侧序号列、AuditLog width 对齐、UserList 计数公式变量名漂移（`currentPage` vs 其他页 `page`，语义同、纯命名）、其他页序号列重构（现状已符合目标形态）
