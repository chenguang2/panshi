# list-page-console-visual Specification

## Purpose
三个独立列表页（节点/上游/路由）的表格与页头视觉解剖对齐方案 C 设计稿（`docs/ui/Live-Artifact-5/proposal-c/`），消除实现与设计的系统性视觉偏差。交互语义、列配置/分页/分组机制不变。

## Requirements

### Requirement: 控制台视觉解剖（三页统一）

三页表格卡 SHALL 挂 `l5-card` 作用域类，并在该作用域内对齐以下设计解剖（样式单一来源 `style.css` L5 层）：

- 表头：`text-transform: none`、底色与卡同底（`var(--bg)`）、padding 9px 12px、11px/600；列间 SHALL NOT 有竖线分隔（列拖拽把手右缘锚线保留）。
- 单元格：padding 10px 12px、13px；行仅底部 1px 水平线；悬停背景 = accent 4%；选中行 accent 8%。
- 行内动作按钮：hover = accent 三件套（accent-bg 底、accent 字、accent 30% 边）、圆角 4px；操作列内 SHALL 提供 1px 竖分隔（v-sep）隔开动作组；状态查询 SHALL 有 12px stroke 图标；mono 数值格（IP/端口/版本）12.5px，IP SHALL 600 字重。
- 页头：h1 21px/600（PageHeader 全站单点）；页头下距 20px（全站单点）；节点页「批量导入」SHALL 在页头 actions 区（与「添加节点」并排）。
- 批量条（节点页）：选中态 SHALL 有 accent 强调（has-sel）且右端 SHALL 提供「清除选择」。
- 分页：**分组/服务端分页列表 SHALL 使用表格外置分页条**（`:pagination="false"` + `components/ListPager.vue`）——a-table 内置分页会对 `dataSource` 做客户端切片，组标记行会占掉页容量导致每页条数不足（r4-④ 实测：40 节点/页 20，分组第 1 页 18 节点、第 2 页 5 节点）。分页条解剖见「分页条解剖（外置 ListPager）」需求。
- 「列配置」触发器 SHALL 带下拉箭头（▾）。

#### Scenario: 同数据渲染与设计页一致

- **WHEN** 按 nodes.html 原始数据渲染节点管理页并与设计页同视口截图比对
- **THEN** 第 1–8 项差异清单（parity-audit-nodes.md）所列差异全部消除，白名单项除外

#### Scenario: 机制与既有能力不回退

- **WHEN** 视觉重绘完成后运行全量单测与真机抽查
- **THEN** 列配置/分页/分组/批量/发布等既有机制测试全绿，三页表格 `grid-table` 类与拖拽/调宽手势行为不变

#### Scenario: 守卫同步

- **WHEN** 视觉层修改触及既有守卫断言（如 grid-table 竖线相关）
- **THEN** 按约定 #217 先产断言反转清单再同步修改，全量单测收口

### Requirement: 分页条解剖（外置 ListPager）

分组/服务端分页列表 SHALL 以表格外置分页条渲染分页（样式单一来源 `components/ListPager.vue`），解剖 SHALL 与设计稿 `.l5-pager` 一致：容器内距 10px 16px、上边框 1px、高 49px；**左簇** = `共 <b>N</b> 个节点 · 每页 [条数下拉]`（数字 mono 600、下拉 70px 紧跟文案之后）；**右簇** = `‹ 页码… › 跳至 [输入框] 页`（右对齐）；页码项 28×28、mono 12px、间距 4px、圆角 6px；**当前页 SHALL 为实心 accent 底 + 白字**；上一页/下一页 SHALL 为 28×28 白底 1px 边框按钮。每页条目数 SHALL 等于 pageSize 个**数据行**（组标记行不占页容量），序号列跨页连续。

#### Scenario: 分组每页条数

- **WHEN** 列表处于分组模式且服务端 total 与 pageSize 已知（如 40 节点 / 每页 20）
- **THEN** 第 1、2 页各展示 20 个节点行（外加组标记行），组标记行不占页容量，序号 1…40 跨页连续

#### Scenario: 分页条逐元素对齐

- **WHEN** 按设计稿同数据渲染并量测分页条
- **THEN** 左簇贴左、右簇贴右、当前页实心 accent + 白字、prev/next 28×28 带边框、页码间距 4px、条高 49px 全部命中设计值

### Requirement: 组标记行与列宽解剖

- 组标记行 `td` 背景 SHALL 与表头 `th` 同色（`var(--bg)`，含 hover 不变色）；组内不 SHALL 因 hover 改变底色。
- 表头 `th` SHALL 为 `padding: 9px 12px`（行高 38px）；该声明 SHALL 以 `!important` 落地以压过 AntDV `size="middle"` 的生成规则。
- 列宽 SHALL 取设计值（#48 / IP 149 / 服务端口 82 / 管理端口 82 / 安装路径 377 / 状态 147 / Edge 版本 87 / 操作 298），使表格总宽 = 卡片宽 1310，SHALL NOT 出现横向溢出。
- 行内动作按钮解剖 SHALL 与设计一致（容器 gap 2px、按钮内距 `0 6px`、icon-gap 3px、更多触发器为无边框 26px 图标锚点），行内动作文案 SHALL 为设计稿用词（「状态」而非「状态查询」；批量条仍为「批量状态查询」）。

#### Scenario: 操作列不溢出

- **WHEN** 节点页以设计列宽渲染
- **THEN** 操作列 298px、表格总宽 ≤ 卡片宽，右端「更多」不被裁切

#### Scenario: 组头与表头同色

- **WHEN** 量测组标记行 td 与表头 th 背景计算值
- **THEN** 两者相等（`oklch(97% 0.005 250)`）

### Requirement: 操作列触发器与动作菜单解剖

操作列「更多」触发器 SHALL 为无边框透明锚点：盒 26×24、`border-color: transparent`、`background: transparent`、圆角 4px、图标为 **12px 三圆横排实心图形**（`circle r=1.7`，`cx=5/12/19`，`cy=12`，`fill=currentColor`，`stroke=none`），颜色 `var(--muted)`。三页 SHALL 共用同一实现（`StrokeIcon name="dots"`），SHALL NOT 使用 antd `MoreOutlined`（竖排三点）或文本 `⋯`。

动作菜单解剖 SHALL 与设计 `.l5-menu` 一致：宽 215px、内距 4px、圆角 6px；条目 `padding: 7px 10px`、`line-height: 1.4`（单行条目高 32.2px、两行式 48.6/64px）；主文案 13px/600、解释行 11px/400 `var(--muted)`；分隔线为 `border-top: 1px solid var(--border)` + `margin: 4px 6px`（SHALL NOT 使用底色块形态）；`.menu-item-stack` SHALL NOT 追加纵向内距。带解释的动作菜单 SHALL 挂 `class="l5-action-menu"` 作为上述解剖的作用域（避免固定 215px 波及全站下拉）。

菜单分组 SHALL 为「常规组（详情/编辑/复制/数据库对比等）→ 分隔线 → 危险组（删除类）→ 分隔线 → 动作组（安装/升级等）」：危险操作 SHALL 独占一栏、`danger` 标红、携带常驻解释（后果重且点击前不可见者必填，见 `action-menu-explanations`）；配置驱动的菜单 SHALL 在配置项携带 `danger`/`desc` 元数据，SHALL NOT 依赖模板内硬编码顺序。

#### Scenario: 触发器逐元素对齐

- **WHEN** 量测节点/上游/路由三页「更多」触发器的计算样式与几何
- **THEN** 三页均为 26×24、边框透明、背景透明、圆角 4px、图标 12×12 且含三个 `cy=12` 的圆

#### Scenario: 危险操作独占一栏

- **WHEN** 用户打开节点/上游/路由任一行「更多」菜单
- **THEN** 删除项位于两条分隔线之间、主文案为危险红、下方常驻灰色解释行

#### Scenario: 菜单宽与条目高

- **WHEN** 量测菜单
- **THEN** 宽 215px，单行条目高 32.2px，长解释折行为两行（条目 48.6/64px），分隔线 1px 且左右各 6px 边距

### Requirement: 状态胶囊语义与「管理开关态」

状态胶囊 SHALL 区分两类语义：① 健康/运行态（运行中/已停止/未检测）为实底胶囊 + 6px 圆点；② **管理开关态（已禁用）为空心虚线胶囊**——透明底、`1px dashed oklch(50% 0.018 240 / 40%)`、**无圆点**、并携带语义 `title`（「管理开关已禁用：不承载业务流量，仍可执行节点任务与状态查询」）。两类语义 SHALL NOT 互相替代（`disabled` 与 `neutral` 是不同状态，禁合并）。

胶囊解剖 SHALL 为高 20px、圆角 999px、11px/600、字距 0.01em、圆点 6px、左右内距 `0 8px`；SHALL NOT 为容纳两枚并排而收紧内距（状态列 147px 下两枚并排仅需 115.6px）。任何展示「管理开关关闭」的列表 SHALL 使用该变体（节点独立页行内、节点详情弹窗、统一管理 Tab 节点表）。

#### Scenario: 已禁用为虚线空心胶囊

- **WHEN** 节点管理页某行 `status === 0`
- **THEN** 「已禁用」徽章为透明底 + 1px 虚线、无圆点、带管理开关语义 title，且与「已停止」并排仍单行

#### Scenario: 胶囊尺寸与设计一致

- **WHEN** 量测「已停止」与「已禁用」胶囊
- **THEN** 高度均为 20px、内距 `0 8px`，宽度分别为 60.3px 与 51.3px（与设计一致）

### Requirement: 表格宽度自适应（默认列宽随可用宽等比缩放）

三个独立列表页的默认列宽 SHALL 随表格可用宽度等比缩放，SHALL NOT 以固定像素总和撑出横向滚动：

- 可用宽 ≥ 设计总宽：SHALL 原样使用设计列宽（1600 验收视口与设计逐值一致），SHALL NOT 向上拉伸；
- 可用宽 < 设计总宽但 ≥ 最小总宽：全部列 SHALL 按 `可用宽 / 设计总宽` 等比收缩；
- 可用宽 < 最小总宽：SHALL 按最小总宽渲染（此时允许横向滚动，与设计页阈值同义）；
- 用户拖拽过的列 SHALL 保持其像素宽度（拖拽优先），其余列的宽度差额 SHALL 由弹性列吸收，使列宽总和恰等于可用宽；
- 内容不可压缩的列 SHALL 有缩放下限（节点页：状态列 ≥ 140px、操作列 ≥ 268px），避免等比收缩把胶囊挤成两行或把按钮组挤出单元格。

表格 SHALL NOT 使用 `scroll.x = 'max-content'`（该值会让 `<table>` 宽度恒等于列宽总和，任何窄于设计总宽的窗口都会溢出）；SHALL 使用最小总宽数值。

#### Scenario: 中等宽度视口零横向滚动

- **WHEN** 浏览器视口为 1440px（表格卡可用宽 1150px）并点击「重置列宽」
- **THEN** 表格宽度 = 1150px、无横向滚动条，各列按设计比例收窄（安装路径列吸收余量）

#### Scenario: 极窄视口按最小总宽滚动

- **WHEN** 视口窄至表格卡可用宽低于最小总宽
- **THEN** 表格维持最小总宽并出现横向滚动条（与设计页一致），列宽不再继续收缩

### Requirement: 列配置提示行

列配置弹层的拖拽提示行 SHALL 由**图标 + 文字**组成：13px 描边图标（左右双箭头 + 中横线）+ 文案「拖动表头右缘可调整列宽，拖动表头整格可调整列序」，横向 flex 排列、间距 7px、颜色 `var(--muted)`；三页 SHALL 共用同一实现（`components/StrokeIcon.vue` 的 `resizeH`）。

#### Scenario: 提示行带图标

- **WHEN** 打开任一独立列表页的「列配置」弹层
- **THEN** 提示行左侧有一个 13px 的双向箭头图标，随后是提示文案

### Requirement: 上游「目标节点与健康」列

上游页目标列 SHALL 按设计 `.tg-list` 解剖渲染，而非单行 `ip:port · 权重 N` 的退化 chip：

- 每个目标一枚 `.tg-chip`：圆角 999、内距 `2px 8px`、底 `var(--bg)`、1px `var(--border)`、**mono 11px**、内含 `gap 6px`；
- chip 内容 SHALL 依次为：6px 状态点（`.dot`）→ `地址:端口` → 44×4 权重条（`.tg-bar`，内条 accent、宽度 = 占比）→ `权重 · 占比%`（`.tg-w`，muted）；
- 列表容器 SHALL 为纵向 flex、`gap 4px`、`align-items: flex-start`；
- 列表下方 SHALL 有汇总行（`.tg-sum`，11px muted）：「`N 目标 · 全部健康`」，非健康时「`N 目标 · K 项待验证`」用 warning 600；
- 占比口径 = `round(该目标权重 / 有效目标权重和 × 100)`，逐目标独立四舍五入（与设计稿 80/60/40 → 44/33/22 一致，合计允许非 100）。

平台无目标级健康数据时，健康状态 SHALL 以上游发布态近似并在 title 中说明：已发布（`published_at` 非空）+ 无待发布（`pending_publish` 非 true）+ 上次发布无异常（`last_publish_status !== 'partial'`）→ 绿点「全部健康」；否则警示点「K 项待验证」。派生逻辑单点 = `frontend/src/utils/upstreamTargets.ts`（消费方禁止内联重算）。

#### Scenario: 已发布无异常

- **WHEN** 上游 `published_at` 非空、`pending_publish=false`、`last_publish_status` 非 partial，且有 1 个权重 100 的目标
- **THEN** 该行显示绿点 + `100 · 100%` 权重条，汇总行「1 目标 · 全部健康」

#### Scenario: 有待发布变更

- **WHEN** 同一上游被修改后 `pending_publish=true`
- **THEN** 状态点转警示色、汇总行「1 目标 · 1 项待验证」

### Requirement: 发布状态与发布动作解剖

发布状态与行内发布动作 SHALL 对齐设计原语（不再使用 antd 默认按钮/标签的配色与字体）：

- 状态标签 `.ps-tag`：20px 高、`padding 0 8px`、圆角 999、11px/600、**`var(--font-mono)`**、**无边框**；四态配色 = 已发布 `var(--success)` + `oklch(55% .15 145 / 12%)`、待发布 `var(--warning)` + `oklch(65% .15 85 / 14%)`、未发布 `var(--muted)` + `oklch(50% .018 240 / 8%)`（改回 body 字体）、部分失败 `var(--danger)` + `oklch(55% .18 28 / 12%)`（body 字体）。
- 差异预览按钮 `.diff-btn`：20×20、圆角 **999**、accent 淡底（10%）+ accent 30% 描边 + accent 图标（11px chevron SVG）；与标签同容器 `gap 6px`。
- 行内发布按钮 `.op-pub`：高 24、`padding 0 10px`、圆角 `var(--radius-sm)`、accent 35% 描边 + `var(--accent-bg)` 底 + **accent 字**、12px/**500**、正文族；hover 实心 accent + 白字；禁用 40% 透明。
- 文案 SHALL 为「发布」（两字不加空格）——antd 按钮的 `autoInsertSpaceInButton` 默认会把中文两字渲染成「发 布」，故此类主按钮 SHALL 使用原生 `<button>` + `.op-pub`。

#### Scenario: 行内发布按钮

- **WHEN** 上游/路由列表中某行可发布
- **THEN** 操作列首枚按钮为 `.op-pub`（accent 描边淡底、12px/500），文案「发布」无内部空格

### Requirement: 工具条控件宽度同一口径

- 独立列表页工具条的筛选控件 SHALL 与节点页同口径：全部分组 `104px`、全部集群 `120px`、全状态/全算法 `120px`、搜索框 `150px`；新增筛选控件 SHALL 复用该组宽度，不得各页自定。

#### Scenario: 上游页工具条

- **WHEN** 打开上游管理页
- **THEN** 分组/集群/算法三个下拉分别为 104/120/120，搜索框 150，与节点管理页逐值相等

### Requirement: 状态筛选统一为带计数的 chips

五个列表页（节点 / 路由 / 上游 / 四层代理 / DNS 代理）的状态筛选 SHALL 统一为同一形态：

- 形态 = `.f-chip.chip-status` 胶囊（`var(--surface)` 底 + 1px `var(--border)`、圆角 999、12px）、可点、单选；
- 计数 SHALL 以 `.f-count` 后缀呈现（mono 11px，选中时随字色变 accent）；「全部」chip 显示总数；
- 计数为 0 的 chip SHALL 保留可点，仅降透明（`.empty`，55%）；
- 选中态 = `var(--accent-bg)` 底 + accent 边 + accent 字 + 加粗，并同步 `aria-pressed`；
- 位置 SHALL 为「工具条下方独立 chips 行」（`data-test="status-chip-row"`，节点/路由/上游）或「卡片页头行内」（四层/DNS，`sp-header-actions` 内）；
- 工具条 SHALL NOT 再提供「全部状态」下拉（状态只能经 chips 筛选，单入口）。

计数 SHALL 来自权威值：分页列表页取后端聚合端点（`GET /routes/status-counts`、`GET /upstreams/status-counts`），
全量加载页（四层/DNS/节点）取全量数据集前端聚合；SHALL NOT 用 `page_size=500` 抽样估算
（实测路由 1596 条时「未发布」显示 331 而真实 1421）。

节点页的「已禁用」chip SHALL 标注为管理开关维度（`status === 0`，与运行态可重叠）。

#### Scenario: 点状态 chip 即筛选

- **WHEN** 在上游页点击「待发布 39」
- **THEN** 列表按 `publish_status=pending` 重新请求、分页条显示「共 39 个上游」，该 chip 高亮，其余 chip 计数不变

#### Scenario: 切换其它筛选后计数随之更新

- **WHEN** 把集群筛选改为某集群（状态 chip 未动）
- **THEN** 各状态 chip 的计数按该集群重算（计数查询包含集群条件、且不含 publish_status）

### Requirement: 方法筛选单一入口（下拉）

路由页「方法」筛选 SHALL 只有一处入口：工具条「全部方法」下拉（GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS/CONNECT/TRACE）。
SHALL NOT 同时保留方法 chips 行（双入口会让同一筛选出现两处、并挤占工具条宽度）。

#### Scenario: 方法修改生效

- **WHEN** 在下拉中选择 `HEAD`
- **THEN** 列表请求携带 `method=HEAD`，页面上不存在方法 chips 行

### Requirement: 页头统计徽标只留总数

列表页页头 SHALL 只保留一个总数徽标（如「1596 路由」），状态分布 SHALL 由状态 chips 承担；
SHALL NOT 在页头重复展示「已发布 / 待发布 / 未发布」等状态计数（同一组数字出现两次，且页头版本历史上是抽样估算）。

#### Scenario: 路由页页头

- **WHEN** 打开路由管理
- **THEN** 页头只有一个「N 路由」徽标，状态分布只出现在第二行 chips

### Requirement: 工具条不压缩契约

列表页工具条（`.l5-toolbar`）SHALL 满足：

- 子元素 `flex-shrink: 0`——声明宽度即最终渲染宽度（缺此项时 flex 会按内容比例各自压缩，实测六个下拉渲染成 113.5/118.4/128.3/140/106.1/106.1）；
- 模式段 `.seg`（分组/平铺）SHALL NOT 被压缩（缺失时会被压到 2–24px，表现为「平铺看不见」）；
- 筛选控件宽度统一：分组 104px、集群 120px、状态·算法 120px、搜索框 150px、其余下拉 104px；
- 空间不足时 SHALL 由 `flex-wrap` 换行兜底（`row-gap` 6px），SHALL NOT 压扁或挤出右侧操作簇。

#### Scenario: 1440 视口单行不溢出

- **WHEN** 1440 视口打开节点/上游/路由任一页
- **THEN** 工具条单行、`scrollWidth == clientWidth`、`.seg` 宽度 99px（等于其内容宽）
