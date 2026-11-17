# 设计页 vs 实现页 差异清单 · 第四轮（节点管理页 · 用户真机复核驱动）

> 延续 `mockup-parity-verification` 方法（同数据注入 → 同视口截图 → 逐元素计算样式比对）。
> 设计基准：`docs/ui/Live-Artifact-5/proposal-c/nodes.html` + `theme.css`。
> 实现基准：`frontend/src`（HEAD = 2b56496c + 未提交的 r1–r3 改动）。
> 取证脚本：`/tmp/opencode/parity-r4/probe.mjs`、`probe-ops.mjs`（Playwright 1600×1000，双侧计算样式与几何量测）。
> 本轮 5 项均为用户真机复核发现；另附 3 项量测附带发现。

---

## 1. 页头统计标签字重（用户项 ①）

| 量测 | 设计 | 实现 |
|---|---|---|
| 胶囊 `.ph-lite` `font-weight` | **600** | **400** |
| 胶囊 `letter-spacing` | -0.42px | normal |
| 数字 `<b>` 字重/字族 | 600 / JetBrains Mono | 600 / JetBrains Mono ✓ |

- **原因（继承上下文丢失）**：设计页的 `.ph-inline` 写在 `<h1>节点管理<span class="ph-inline">…</span></h1>` **内部**，因此继承 h1 的 `font-weight:600` 与 `letter-spacing:-0.42px`；实现页 `PageHeader.vue` 把 `#stats` 槽渲染为 `<h1>` 的**兄弟节点**（`.page-header-title-row` 内），继承链断掉 → 标签文字（「节点/运行中/已停止/未检测」）比设计细一档，只有数字仍是 600。
- **建议**：`style.css` 的 `.ph-lite` 补 `font-weight: 600; letter-spacing: -0.42px`（全站统计徽标单点，其余页同一观感）。零结构改动。

## 2. 操作列过宽 + 表格横向溢出（用户项 ②）

| 量测 | 设计 | 实现 | 差 |
|---|---|---|---|
| 操作列宽 | 298.1px | **363px** | +65 |
| 表格总宽 / 卡片宽 | 1310 / 1310 | **1352 / 1310** | 溢出 42px（右端被裁，截图右侧「…」贴边） |
| 行内按钮内距 | `0 6px`，icon-gap 3px | `3px 10px`，gap 6px | 每颗按钮 53 → **64px** |
| 行内按钮文案 | 启动 / 停止 / **状态** / 重载 | 启动 / 停止 / **状态查询** / 重载 | 4 字多 35px |
| 更多触发 | 26×24 无边框图标锚点 | 32×24 **带边框白底**按钮 | +6 |
| 动作容器 gap | 2px | 4px | — |

- **原因**：操作列 `width: 320` 只是声明值；`table-layout: fixed` + `scroll.x: max-content` 下，行内按钮的实际内容宽（339px）+ 单元格内距（24px）= 363px 反超列宽，整表被撑到 1352px。
- **建议（L5 作用域内，两条一起做才能落到 298）**：
  1. 行内按钮解剖对齐设计：`.node-actions-wrap { gap: 2px }`、`.btn-ghost.btn-sm { padding: 0 6px; gap: 3px }`、更多触发器去边框（26px 图标锚点）；
  2. 行内文案按设计缩短为「**状态**」（批量条保留「批量状态查询」不变），操作列宽设 298。
  - 备选：保留「状态查询」文案 → 操作列 306px、安装路径 377→369px 抵消，仍不溢出但不与设计像素等同（**需裁决**）。

## 3. 分组行底色（用户项 ③）

| 量测 | 设计 | 实现 |
|---|---|---|
| 组头 `td` 背景 | `oklch(97% 0.005 250)` = `var(--bg)` | `oklch(100% 0 0)` = `var(--surface)` |
| 表头 `th` 背景 | `oklch(97% 0.005 250)` = `var(--bg)` | 同 ✓ |

- **原因**：设计稿组头色 = `--bg`，与**表头行同色**（`theme.css: tr.l5-group td { background: var(--bg) }`）。r3-1 的审计只 grep 了 `.l5-group > td`（未命中 `tr.l5-group td`），误判为「设计无背景规则 → 卡面白」，于是把实现改成了 `--surface` —— 即用户所见「和表头那一行不一样」。
- **建议**：`style.css` 组头 td 背景（含 hover）回退为 `var(--bg)`，与表头同色。

## 4. 分组模式下每页条数不对（用户项 ④ · 真 Bug）

| 场景 | 设计/预期 | 实测（40 节点 · pageSize 20 · 3+ 集群） |
|---|---|---|
| 分组 · 第 1 页 | 20 个节点 | 20 行 = **2 组头 + 18 节点** |
| 分组 · 第 2 页 | 20 个节点 | 11 行 = **5 组头 + 5 节点** |
| 平铺 · 第 2 页 | 20 个节点 | **20 节点 ✓** |

- **原因（机制）**：`ant-design-vue/es/table/Table.js:257-269` 对 `dataSource` 做**客户端切片** `slice((current-1)*pageSize, current*pageSize)`；本页 `data-source="displayRows"` 是**已注入组标记行**的分组行数组，而 `pagination.total` 是服务端节点总数 → 组头行占掉页容量，尾部记录被切掉。组越多（第 2 页 5 个组）丢得越多；平铺模式无组头行故正常。
- **连带**：序号列 `(page-1)*pageSize + sequenceOf(record)` 的口径也被打乱（当页渲染序 ≠ 全局序）。
- **建议**：分组列表**不能再用 a-table 内置分页**（它对 dataSource 切片，无法关闭）。改为 `:pagination="false"` + 独立分页条组件（后端分页驱动，条目数恒 = pageSize 节点），分页条同时承载用户项 ⑤ 的设计形态。范围：节点/上游/路由三页（上游/路由为同源缺陷，本轮一并修）。需同步 #54 标准与既有分页守卫（断言反转清单）。

## 5. 底部页码行（用户项 ⑤）

| 项 | 设计 `.l5-pager` | 实现 `.ant-pagination` |
|---|---|---|
| 布局 | 左：`共 N 个节点 · 每页 [20 条]`；右：`‹ 1 2 3 › 跳至 [1] 页` | **全部右对齐**，且顺序错乱：`[20 条] 共 40 个节点 · 每页 ‹1 2› 跳至 页` |
| 总数数字 | `<b>` mono **600** | 纯文本 12px 常规 |
| 当前页 | **实心 accent 底 + 白字** | 10% accent 淡底 + accent 字 + accent 描边 |
| 上一页/下一页 | 28×28、白底、1px 边框、6px 圆角 | 28×**24**、**无边框** |
| 页码间距 | 4px | 0px |
| 分页条高 | 49px | 53px |
| 「每页」下拉 | 70px，紧跟文案之后 | 65.7px，被 `order:-1` 拉到总数**之前** |

- **原因**：r2-9 用 `display:contents` + `order:-1` 把 antd 的 `options` 拆出来重排，但 antd 分页容器本身 `justify-content:flex-end` → 「左侧信息簇」永远贴不到左边；`showTotal` 只接受字符串，无法输出 `<b>` 数字；`prev/next` 的边框规则选择器与实际 DOM（`button` 包裹）不匹配。
- **建议**：分页条改为**表格外独立组件**（设计 `.l5-pager` 结构），一次性解决 ④ 与 ⑤：
  左簇 `共 <b>N</b> 个节点 · 每页 [下拉]`，右簇 `‹ 页码… › 跳至 [input] 页`，尺寸/间距/色值取设计值。建议落为共享 `components/ListPager.vue`（分页条单点），后续其它列表页按此标准迁移。

---

## 附加发现（未在用户清单内，建议同批裁决）

### E1. 表头内距未生效（r1 该项从未落地）

- 设计 `th { padding: 9px 12px }`、行高 **38px**；实现实际渲染 `12px 8px`、行高 **47px**。
- 原因：L5 段 `.table-container.l5-card .ant-table-thead > tr > th`（3 个类）被 AntDV `size="middle"` 生成的选择器（4 个类）压过，且 r1 未加 `!important`（同段其它属性加了）。→ 表头比设计高 9px。
- 建议：该条 padding 补 `!important`。

### E2. 其余列宽分布与设计不一致（总宽随之溢出）

| 列 | 设计 | 实现 |
|---|---|---|
| # | 48 | 45 |
| IP | 149 | 140 |
| 服务端口 | 82 | **100** |
| 管理端口 | 82 | **100** |
| 安装路径 | **377** | 314 |
| 状态 | 147 | 140 |
| Edge 版本 | 87 | **110** |
| 操作 | 298 | **363** |

- 建议：8 列一次按设计值重设（+ 选择列 ≈41 → 合计 1310，恰好卡片满宽、不溢出）。这是「操作列看起来过宽」的另一半成因：设计把富余宽度给了安装路径，实现给了端口/版本/操作。

### E3. 数据行高 64.3px vs 设计 61.5px

- 主要为行内按钮高 24.8 vs 24（`3px 10px` 内距所致），随用户项 ② 的解剖修正自然收敛。

---

## 判定与范围

- 用户项 ①③ + E1 为 CSS 单点修正；②/E2/E3 为 L5 作用域解剖 + 列宽；④⑤ 为**机制改动**（内置分页 → 外置分页条），影响 #54 全站分页标准与既有守卫。
- 复测方式不变：同数据注入（必要时把实现页数据替换为设计页 12 节点 3 集群原数据）+ 逐元素量测 + 全量单测。
- ④⑤ 的机制条须先产出断言反转清单（约定 #217）再落地。

---

## 实施记录（2026-11-17，五项裁决全部批准后落地）

### 改动清单

| 文件 | 改动 |
|---|---|
| `components/ListPager.vue`（新建） | 设计 `.l5-pager` 解剖单点：左簇 `共 <b>N</b> 单位 · 每页 [下拉]`、右簇 `‹ 页码… › 跳至 [input] 页` |
| `views/NodeList.vue` / `UpstreamList.vue` / `RouteList.vue` | `:pagination="false"` + 外置 `<ListPager>`；删 `paginationProps`/`TablePaginationConfig` 接线 |
| `composables/useClusterNodes.ts` + `NodeList.vue` | 行内「状态查询」→「状态」（批量条保留「批量状态查询」） |
| `views/NodeList.vue` 列宽 | #48 / IP149 / 服务端口82 / 管理端口82 / 安装路径377 / 状态147 / Edge版本87 / 操作298 |
| `style.css` | `.ph-lite` 600 + -0.42px；组头 td 底色 `var(--bg)`；行内按钮解剖（gap 2、`0 6px`、更多 26px）；表头 `padding 9px 12px !important` + `line-height 1.5`；td `line-height 1.5`；`.l5-pager` 视觉段 |
| `utils/usePagination` 相关测试 / `mockupParity.source.test.ts` / `tableAnatomy.source.test.ts` | 断言反转与白名单（见下） |
| `components/__tests__/ListPager.test.ts`（新建） | 分页条结构与事件 |

### 复测实测值（同数据注入，Playwright 量测）

| 项 | 设计 | 实施后 | 结论 |
|---|---|---|---|
| 统计胶囊字重/走字距/高 | 600 / -0.42px / 24px | 600 / -0.42px / 24px | ①命中 |
| 操作列宽 | 298 | 298 | ②命中 |
| 行内按钮宽/高/圆角/间距 | 53 / 24 / 4 / 2 | 53 / 24 / 4 / 2 | ②命中 |
| 表格总宽 vs 卡片宽 | 1310 = 满宽 | 1310 / scrollWidth 1310 | 无横向溢出 |
| 组头 td 背景 | `oklch(97% 0.005 250)` | 同值 | ③命中 |
| 分组第 1 页数据行 | 20 | 20（组头 2 行另计） | ④命中 |
| 分组第 2 页数据行 | 20 | 20（组头 10 行另计，旧实现 5） | ④命中 |
| 每页 10 条时数据行 | 10 | 10 | ④命中 |
| 序号跨页连续 | 1…40 | 20 → 21…40 | ④命中 |
| 分页条左簇/右簇 | 贴左 / 贴右 | x=281 / x=1329（右端 1559=卡右缘） | ⑤命中 |
| 当前页 | 实心 accent + 白字 | `oklch(0.56 0.16 210)` + 白字 | ⑤命中 |
| 页码项 / prev·next | 28×28 / 28×28 带边框 | 28×28 / 28×28 带边框 | ⑤命中 |
| 分页条高 / 内距 | 49 / 10px 16px | 49 / 10px 16px | ⑤命中 |
| 表头内距 | 9px 12px | 9px 12px（`!important` 生效） | E1 命中 |
| 数据行高 | 61.5 | 62.5（td line-height 1.5；残差 1px 来自路径格行盒） | E3 收敛 |
| 八列宽度 | 48/149/82/82/377/147/87/298 | 逐一相等 | E2 命中 |

**未清除的残差（已接受）**：表头行高 41 vs 设计 38——差 3px 来自表头选择列 AntDV checkbox 22px 盒高（设计原生 checkbox 14px），非内距问题；改 checkbox 尺寸会波及全站多选样式，收益不足，留观察。

### 断言反转清单（约定 #217）

- `tableAnatomy.source.test.ts`：原「一律 45」→ 增 `DESIGN_WIDTH_OVERRIDES` 白名单（`views/NodeList.vue: 48`，来源本变更 specs delta 的列宽需求）；其余 12 处仍 45。
- `mockupParity.source.test.ts`：r4-E2 scope 改为钉八列设计值；行内按钮圆角断言放宽为接受 token。
- `NodeList.test.ts` / `UpstreamList.test.ts` / `RouteList.test.ts`：分页定位从 `.ant-pagination-item` 迁到 `.l5-pager .p-btn`；stub 的 tfoot mock 分页按钮删除（分页条已是真实组件）。
- 全量单测收口：213 files / 2937 tests 绿（`--maxWorkers=4`，2026-11-17）；`vue-tsc -b` 0 error。

### 标准同步

- 本变更 delta spec 已写入「分组/服务端分页列表 SHALL 使用外置 `ListPager`」与分页条/组头/列宽解剖需求。
- `AGENTS.md` #54 补记该分页形态与 `ListPager` 单点，其余列表页迁移列为后续任务（不在本轮）。
