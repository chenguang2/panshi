# 设计页 vs 实现页 差异清单（节点管理页 · 同数据比对取证）

> 取证方法（将成为 `mockup-parity-verification` 验收标准）：Playwright 拦截 `/api/v1/nodes`、`/api/v1/clusters`，
> 注入 `nodes.html` 设计页原始数据（生产/预发/开发三集群 12 节点、总数 27），两侧 1600×1000 同视口截图：
> `design-nodes.png`（设计页）/ `impl-nodes.png`（实现页），并逐元素量测两侧计算样式。
> 值来源标注：〔theme〕= theme.css / nodes.html 实算值；〔impl〕= 实现页实算值。

用户清单 8 项 + 取证新发现 4 项（编号 A–D）。每项含：设计 → 实现 → 原因 → 建议修法 → 建议。

---

## 1. 段落间的间距

| 元素 | 设计 | 实现 | 结论 |
|---|---|---|---|
| 页头↔卡片 | `.page-header { margin-bottom: 20px }` | `PageHeader` 24px | 差 4px |
| 卡内工具条 | `.l5-toolbar` padding 12px 16px、高 56px | `.l5-toolbar` 12px 16px ✓ | 一致 |
| 页头描述与徽标行 | h1 与徽标同行、描述紧随 | 同构 ✓ | 一致 |

**建议**：PageHeader margin-bottom 24→20px（页头组件单点，全站生效需确认其它页观感；或仅三页 scoped 覆盖）。**推荐：全站 24→20px**（间距更紧凑，与设计稿唯一差异项，其余页面同基准设计语言）。

## 2. 字段间的分隔符

- 设计：单元格之间**无竖线**；`.l5-table thead th.resizable::after` 表头右缘 2px 短棒（悬停 accent，列宽调整可视提示）；操作列内部 `.v-sep`（1×14px 竖线，隔开「状态查询」与「重载」两组）。
- 实现：`.grid-table .ant-table-cell { border-right: 1px solid var(--border) }` **全表竖线**；表头握把线（col-resize-handle::after，悬停 accent）承担了类似角色；操作列无 v-sep。

**原因**：`.grid-table` 竖线是列个性化时期（column-personalization-rollout D5）的全站决策，先于控制台设计稿；v-sep 是设计稿新语言，未随 restyle 落地。

**建议**：① 三页（`.l5-card` 作用域）移除单元格竖线，保留表头右缘短棒作为拖拽把手锚（现有 col-resize-handle 视觉已接近设计稿的 resizable 短棒，二者合一）；② 操作列加 `.v-sep`（状态查询｜重载 之间）。**注意**：`tableHeaderHitArea.source.test.ts` 守卫 th 内距/命中区，`grid-table` 竖线断言需同步反转（约定 #217 先清单后改）。

## 3. 各个部分的字体、字号、是否黑体

| 元素 | 设计 | 实现 | 差异 |
|---|---|---|---|
| 表头 th | 11px/600、**text-transform: none**、**bg var(--bg)（与卡同底）**、padding 9px 12px | 11px/600、**uppercase**、**灰底 oklch(97% 0.005 250)**、12px 8px | 大写、底色、内距 |
| 单元格 td | 13px、padding 10px 12px | 13px、padding 12px 8px | 内距 |
| 页头 h1 | **21px/600** | **22px/700** | 字号字重 |
| IP 格 | `.c-mono.c-strong` = mono 12.5px + **600** | `.text-mono` mono 13px、**无字重** | 字重+字号 |
| 名称格 | `.cell-primary` 600 + `.cell-secondary` 12px 弱化 | 同构 ✓ | 一致 |
| 胶囊 | `.pill` 20px 高/11px/600 | 20px/11px/600 ✓ | 一致 |
| 徽标 | `.ph-lite` 24px/11.5px | 24px/11.5px ✓ | 一致 |

**原因**：`.table-container` 全站表头规则（uppercase + 灰底 + 12px 8px）先于方案 C 设计稿；设计稿 `.l5-table` 规则未覆盖它。**建议**：三页 L5 作用域覆盖 th/td（去大写、bg=var(--bg)、padding 对齐 9px 12px / 10px 12px）；h1 三页 21px/600（PageHeader 单点，推荐全站统一——设计稿九页均为 21/600）；IP 格补 600 字重 + 12.5px。

## 4. 控件的大小长度高度

| 控件 | 设计 | 实现 | 差异 |
|---|---|---|---|
| 搜索框 | 32 高；theme 默认宽 200（nodes.html 页内覆盖 150） | 32 高、宽 200（聚焦 240） | 基本一致；nodes 页内 150 属页面级微调 |
| 下拉 select | 32 高 ✓ | 32 ✓ | 一致 |
| tool-btn（刷新/列配置） | **30px 高**、12px | 30px/12px ✓ | 一致 |
| op-btn（行内动作） | 24px 高、**radius 4px** | 24.8px、**radius 6px** | 圆角 |
| 分组\|平铺 seg | 32px ✓ | 32px ✓ | 一致 |

**建议**：op-btn 行内动作圆角 6→4px（`.btn` 全站圆角不动，仅三页表格内按钮 scoped）；搜索宽度维持 200（theme 默认），若需逐页 150 由页面传 `:width`（SearchInput 已支持）。

## 5. 行的 border（行边框/行底色）

- 设计：行仅**底部 1px** 水平线（末行无）；**悬停 = accent 4%**（`.l5-table tbody tr:hover > td { background: oklch(56% 0.16 210 / 4%) }`）；选中行 accent 8%。
- 实现：行底部 1px ✓；**竖线见第 2 项**；**悬停 = 灰 oklch(97% 0.005 250 / 60%)**（`.table-container` 规则带 !important，压过了我们 style.css 已写入的 L5 accent 4% 悬停）。

**原因**：`.table-container`（全站表格壳）级联优先级高于 `.l5-table` 段。**建议**：三页卡片内悬停改 accent 4%（L5 段已有规则，提升其优先级/加 !important 或收窄 table-container 规则作用域）；行底边框已一致不动。

## 6. 按钮的悬停（hover）

- 设计：op-btn hover = `background: var(--accent-bg); color: var(--accent); border-color: accent 30%`；tool-btn hover = accent 同款（我们 tool-btn 已一致 ✓）。
- 实现：行内 btn-ghost hover = `background: var(--bg); color: var(--fg)`（灰底黑字，无 accent 语义）。

**建议**：三页表格内行动作按钮 hover 改 accent 三件套（scoped 于 `.l5-card`，不动全站 .btn-ghost——全站其它页的 ghost hover 语义另行观察）。

## 7. 按钮图标

- 设计：行内动作为 12px stroke SVG：启动 ▷、停止 ■、状态（波形）、重载 ↻，组间 `.v-sep`，末位 ⋯（更多）；工具条「列配置」带 ▾ 下拉箭头。
- 实现：antd 图标（PlayCircleOutlined/PauseCircleOutlined/ReloadOutlined + ⋯），**状态查询无图标**，无 v-sep，「列配置」无 ▾。

**建议**：① 状态查询补图标（SearchOutlined 语义不符，设计稿为波形——用 antd `DashOutlined`/自定义 12px SVG 波形，倾向自定义 SVG 贴稿）；② 操作列加 v-sep（见第 2 项）；③「列配置」按钮补 CaretDownOutlined ▾；④ 图标统一 12px stroke 风格（antd outlined 已是 stroke 系，保留，不换自绘 SVG——维护成本低于像素级复刻，视觉差可忽略）。

## 8. 翻页样式

- 设计（`.l5-pager`）：条内底部独立条——左「共 N 个节点 · 每页 [20 条▾]」，右侧 **28px 方形 mono 页码按钮**（current accent）+ 「跳至 [1] 页」输入。
- 实现：antd pagination（24px 高、radius 6、fontSize 14、showTotal 左侧、sizeChanger、快速跳页）——机制与 #54 全站分页标准一致，形态不同。

**建议（方案 B，推荐）**：**保留 antd 分页机制**（#54 全站标准、守卫与既有用例不动），仅对三页卡片内做视觉重绘：`.l5-card .ant-pagination` 作用域 CSS——页码项 28×28 方形、mono 12px、current accent 边+底、总数字 12px 弱化、sizeChanger/快速跳页文案样式贴近稿。**方案 A（不推荐）**：自绘 l5-pager 组件替换——与 #54 冲突、守卫/用例大改、翻页状态机重复实现。

---

## 取证新发现（A–D）

**A. 批量导入位置**：设计在页头右侧（「⬆ 批量导入 + ➕ 添加节点」双按钮）；实现在批量条右端。**建议**：迁至页头 actions slot（批量条右端保留「清除选择」——见 B）。
**B. 批量条选中态**：设计 has-sel 时 accent 浅底 + 右端「清除选择」按钮；实现无选中态强调、无清除选择（proposal What Changes 本有此项，spec delta 未落）。**建议**：补齐（`.l5-batchbar` 样式已在 style.css L5 段备好：has-sel accent + clearSel）。
**C. IP 字重**：并入第 3 项表内，已列。
**D. 列配置按钮 ▾**：并入第 7 项③。

## 判定阈值（将成为验收标准的一部分）

逐元素比对以计算样式为准：字号/字重/颜色/圆角/高度/内距**零容差**（直接取设计值）；宽度类允许 ±2px（内容自适应）；框架性差异白名单：antd 组件壳（modal/dropdown/popover 内部结构）、滚动条样式、字体回退链（设计 SF Pro/Inter，实现按仓库既有 --font-sans）。
