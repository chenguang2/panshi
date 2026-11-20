# 设计页 vs 实现页 差异清单 · 第三轮（节点管理页 · 用户真机复核驱动）

> 延续 mockup-parity-verification 方法。r1/r2 已落地项不重复；本轮 5 项均为真机细看发现的偏差。
> 设计值来源：theme.css / nodes.html 实算与原始规则；实现值取自 style.css / 组件源码。

## 1. 组头行背景色

- 设计：`.l5-group > td` **无背景规则** → 透出卡片底（`--surface`，近白）；组头视觉 = 左缘 accent 条 + 浅白通栏。
- 实现：`.l5-group-row > td { background: var(--bg) !important }` —— **页面灰底**（--bg 比卡片面深一档），组头行看起来是一条灰带。
- 原因：上一变更落 L5 组头样式时把背景写成了 `--bg`，与设计稿「透明/卡面」不符。
- **建议**：组头行 td 背景改 `var(--surface)`（hover 同步）。仅 L5 作用域，其余页面无组头行不受影响。

## 2. 操作列弹出菜单的样式与字体

| 元素 | 设计（.l5-menu/.mi） | 实现（antd dropdown 全站规则） | 差异 |
|---|---|---|---|
| 条目主文案 | **13px/600**、fg 色 | 14px/500（悬停转 accent） | 字号 1px；悬停变色 |
| 解释行（small） | 11px muted、margin-top 1px | 11px muted ✓ | 一致 |
| 条目内距 | 7px 10px | 6px 12px | 内距 |
| 悬停 | **仅底色** var(--bg)，文字不变色 | 底色 var(--bg) + **文字转 accent** | 悬停变色 |
| 危险项 | 仅主文案 danger 红，解释行保持 muted | 整条 danger 红（含解释行） | 危险项着色范围 |
| 容器 | surface/1px border/radius-md/shadow-lg | 同 ✓ | 一致 |

- 原因：全站 dropdown 规则（2026-11-13 方案 A「悬停主文案转主题蓝」）先于方案 C 设计稿；危险项 !important 波及解释行。
- **建议（全站，菜单语言全站统一——推荐）**：① 主文案 14px→13px（.menu-item-stack span 全站单点）；② dropdown 悬停不再变色（仅底色）；③ 危险项红色只作用主文案、解释行恢复 muted；④ 条目内距 6px 12px→7px 10px。**注意**：② 与 2026-11-13 方案 A 裁决相反，本项按设计稿反转；action-menu-explanations 语言结构（两行式）不动。

## 3. 翻页「共 N · 每页 [选项]」读感

- 设计：sizeChanger 选项文案 = **「20 条」**（下拉里也是 20/50/10/100 条）。
- 实现：antd 默认 locale 渲染 **「20 条/页」**——与左侧注入的「· 每页」连读成「每页 20 条/页」，语义重复（用户所见「每页 条」违和感来源）。
- 原因：antd locale 默认值；antd-vue Pagination 支持 `buildOptionText` 自定义，此前未用。
- **建议**：`usePagination.paginationProps` 增加可选第三参 `overrides`（Partial<TablePaginationConfig> 合并，机制/#54 不动），三页传 `buildOptionText: (page) => `${page} 条``。全站其它 10 个消费方不传即不变。

## 4. 列配置提示行文案

- 设计：**「拖动表头右缘可调整列宽，拖动表头整格可调整列序」**（一句双能力提示）。
- 实现：「拖动表头右缘可调整列宽」（只说了调宽；整格拖动调序能力已存在但未提示）。
- **建议**：三页弹窗提示行补全为设计全文（纯文案；既有测试断言的是前半句子串，不受影响）。

## 5. 状态格行数（3 行 → 2 行以内）

- 设计解剖（`.status-cell`/`.s-row`/`.exec-time`，style.css L5 段已有）：**第一行 = 全部胶囊横排**（如「已禁用 + 已停止」并排），**第二行 = 检测时间**；固定两行封顶。
- 实现：`.node-status-cell` 为 inline-flex 换行流——「已禁用」「运行态」两枚胶囊在 120px 窄列内**竖向堆叠**，加检测时间行共 **3 行**，行高被撑开（用户所见）。
- 原因：状态格未采用 L5 段早已备好的两行解剖（胶囊行/时间行），沿用了旧换行流。
- **建议**：节点页状态格（列表 + 详情弹窗同构）改用 L5 三类：外层 `.status-cell`（column 布局）、胶囊包 `.s-row`（横排）、时间用 `.exec-time`；配套把 `.l5-card` 作用域内 `s-row` 允许 nowrap（两枚胶囊并排优先于换行）。**连带**：`.node-status-cell`→`.status-cell`、`.status-exec-time`→`.exec-time` 的类名迁移，同步反转 NodeList.test 两处定位与 NodeList.source 的 status 分支守卫（文本仍在窗口内，预计自然保持）。

## 判定与范围

- 全部 5 项零机制变更；第 2 项为全站菜单语言微调（3 个属性级），其余为 L5 作用域/页面级。
- 复测方式不变：同数据注入截图（重点：状态格两行封顶、组头底色、菜单悬停/危险项、翻页读感）+ 全量单测。
