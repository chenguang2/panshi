# 设计页 vs 实现页 差异清单 · 第二轮（节点管理页 · 用户真机复核驱动）

> 第一轮 8+4 项已批准落地（commit 2b56496c 之后）。本轮为用户真机复核发现的 9 项细化偏差。
> 取证方法不变（mockup-parity-verification）：设计值取自 nodes.html/theme.css 实算与原始 SVG，实现值取自实装代码/实算。

## 1. 标题行与上方水平线的距离

- 设计：top-header 底线 = **1px var(--border)**（中性灰）；`.content-area` padding **24px** → 标题距线 24px。
- 实现：`.app-header` 底线 = **2px solid var(--accent)**（品牌色粗线，即用户看到的「水平线」）；`.app-content` padding-top **20px**。
- 原因：全局布局壳（DefaultLayout）早于方案 C 设计稿；内容区内距少 4px，且底线形态不同（粗 accent 线放大了「局促感」）。
- **建议**：① `.app-content` padding 20px→24px（顶部对齐）；② `.app-header` 底线 2px accent → 1px var(--border)（与设计一致；此为全站布局壳改动，所有页面生效——推荐采纳，视觉降噪）。

## 2. 工具条控件宽度

- 设计：搜索 **150px**（nodes.html 页内值；theme 默认 200）、全部分组 **104px**、全部集群 **120px**、全部状态 **104px**。
- 实现：搜索 200px（节点页工具条未挂 nowrap）、全部分组 140px、全部集群 160px、全部状态 130px。
- 原因：页级宽度沿用旧工具条时代取值。
- **建议**：节点页对齐设计——工具条挂 `nowrap`（nowrap 形态搜索框锁定 150px，规则已存在）、下拉宽度 104/120/104（页面级 style，机制不变）。上游/路由两页宽度维持各自现状（其设计稿对应宽度另行核对，本轮以节点页为准）。

## 3. 批量导入 / 列配置按钮无图标

- 设计：批量导入 = 上传托盘 SVG（13px stroke）；列配置 = 滑杆 SVG（三竖线+三滑块，13px stroke）。
- 实现：两者纯文字。
- **建议**：内联设计稿原始 SVG（已提取 path），13px/13px。

## 4. 批量条四个动作图标与设计不一致

- 设计（12px stroke）：批量启动 = 空心三角（`M7 4l13 8-13 8z`）、批量停止 = 双竖条（两 rect）、批量重载 = 旋转箭头、批量状态查询 = 波形。
- 实现：antd 圈形图标（PlayCircleOutlined 等）。
- **建议**：换为设计稿原始 stroke SVG（与行内图标同一套）；antd 圈形图标从批量条与行内动作退场。

## 5. 表头列分隔线形态

- 设计：表头右缘短线 **right:3px、top:30%、height:40%、宽 2px**（悬停变 accent 并加长：top 18%/height 64%）——非上下顶格。
- 实现：`.grid-table .col-resize-handle::after` = `right:0、top:3px、height:calc(100% - 6px)`——接近顶格。
- 原因：把手线当年以「压在竖线分隔上」为前提设计；第一轮去竖线后它成为唯一表头分隔元素，形态应回到设计稿。
- **建议**：L5 作用域内改把手可见线几何为设计值（right:3px/top:30%/height:40%，hover accent + 加长）；命中区（8px 宽）不动，调宽手感不变。

## 6. 组头行的 checkbox（分析项，用户问「是否可以去掉」）

- 现状：antd row-selection 为每一行（含组头行）渲染 checkbox；组头行经 `getCheckboxProps` 已禁用——**它本来就选不了任何东西**（点击无效），纯视觉噪音。
- 设计：组头行 `td colspan=9` 通栏，从最左侧 accent 条开始，无 checkbox。
- **分析结论：可以去掉，且无功能损失**——组内节点勾选靠数据行 checkbox；表头全选只作用于可选数据行（antd 语义，不受影响）；批量条计数不变。
- 实现方案：① 组头行选择列单元格 CSS 隐藏（`.l5-group-row .ant-table-selection-column { display: none }`）；② 同时组头 colSpan 从「可见列数」加 1（补上被隐藏的选择列宽度），保证通栏仍铺满整行。上游/路由两页无 row-selection，不受影响。

## 7. 组头折叠三角形图标

- 设计：**细线 chevron**（stroke polyline `6 9 12 15 18 9`，13px，折叠态旋转 -90°）。
- 实现：antd **实心三角** CaretDownOutlined。
- **建议**：换内联 stroke SVG；折叠旋转由现有 `.g-chev.folded svg` 规则继续承担。

## 8. 行内动作图标（启动/停止/状态查询/重载）

- 设计（12px stroke）：启动 = 空心三角、停止 = 双竖条、状态查询 = 波形（第一轮已换 ✓）、重载 = 旋转箭头。
- 实现：启动/停止/重载 = antd 圈形/线性图标（PlayCircle/PauseCircle/Reload），状态查询已是设计波形。
- **建议**：启动/停止/重载换设计原始 stroke SVG（与批量条同套）；⌀ 更多菜单 ⋯ 保留 antd。

## 9. 翻页左侧「共 N · 每页」

- 设计：`.l5-pager` 左侧 = 「共 27 个节点 **· 每页 [20 条▾]**」（总数与每页选择合并同组），右侧 = 页码方块 + 「跳至 [1] 页」。
- 实现：antd 默认布局——总数在左，「每页 N 条/页」sizeChanger 与快速跳页都在**右端**。
- 原因：antd 结构为 total li + items li + options li（sizeChanger 与 jumper 同在 options li）。
- **建议（机制不动）**：L5 作用域 CSS 重排——options li 用 `display: contents` 拆开，sizeChanger `order:-1` 紧随总数（左侧），jumper 保持右端；总数后缀「 · 每页」用 `.ant-pagination-total-text::after` 注入。不引入自绘组件、不改 paginationProps 机制（#54）。

## 附加核对说明

- 第 1 项②与第 2 项为全站/页级布局改动，其中 1②（header 底线形态）影响所有页面——单独裁决。
- 第 4/8 项图标换为同一套设计 SVG 后，antd PlayCircle/PauseCircle/ReloadOutlined 在节点页的引用将随使用点消失而移除（toolbar 刷新仍用 ReloadOutlined，与设计刷新图标同形）。
- 上游/路由两页：第 1/2/5/9 项随共享层/作用域自动生效；第 3/4/6/7/8 项中仅列配置 ▾（已做）与分页布局适用，其余为节点页特有（批量条/组头选择列），上游/路由不涉及。
