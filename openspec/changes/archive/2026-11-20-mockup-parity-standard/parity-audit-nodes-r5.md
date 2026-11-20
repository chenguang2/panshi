# 设计页 vs 实现页 差异清单 · 第五轮（节点管理页 · 用户真机复核驱动）

> 方法沿用 `mockup-parity-verification`（同视口 1600×1000 → 双侧量测计算样式 → 差异清单逐项批准 → 修改后复测）。
> 设计基准：`docs/ui/Live-Artifact-5/proposal-c/nodes.html` + `theme.css`。
> 实现基准：`frontend/src`（HEAD = 2b56496c + 未提交的 r1–r4 改动，dev 服务 http://localhost:12345）。
> 取证脚本（可复跑）：`/tmp/opencode/parity-r5/probe.mjs`（总表）、`sweep.mjs`（逐元素扫描）、
> `probe3.mjs`（解剖细化）、`probe4/5/7/9/10.mjs`（表头行高溯源）、`probe-menu-routes.mjs`（路由页菜单）、
> `visual.mjs`（同元素裁切截图）。截图存档：`/tmp/opencode/parity-r5/cmp-*.png`。

本轮 = 用户真机复核提出的 3 个缺陷 + 1 个交互讨论项，另附逐元素扫描的 6 项新发现（含 2 项微差）。
**批准前不改代码**（沿用变更既定流程）。

---

## 一、用户项 ①：更多按钮是竖排三点，设计页是横排三点

| 量测 | 设计 | 实现 · 节点页 | 实现 · 路由/上游页 |
|---|---|---|---|
| 触发器盒 | 26×24 | 26×24 ✓ | **32**×24 |
| 边框 | `transparent`（无框） | **1px `var(--border)` 白底** | **1px `var(--border)` 白底** |
| 圆角 | 4px | **6px** | 4px ✓ |
| 内距 | `0 6px` | **0** | `0 7px` |
| 图形 | SVG 12×12，三圆 `r=1.7`，`cx=5/12/19, cy=12`（横排） | **antd `MoreOutlined` 16×16（`viewBox 64 64 896 896`，竖排 path）** | **文本 `⋯` 16px** |
| 颜色 | `var(--muted)` | `var(--fg)`（悬停 accent 三件套） | 同左 |

- **根因**：三页从未统一触发器实现——节点页用 antd 图标组件（其字形为竖排三点），路由/上游页用 Unicode `⋯` 文本；设计页用的是手写 SVG 三圆。三处都与设计不同，且彼此不同。
- **建议（三页统一到设计解剖）**：`StrokeIcon` 增 `dots`（三圆 `r=1.7`、`fill=currentColor`、`stroke=none`，24 网格），三页触发器改为「无边框 26×24 锚点 + 12px `dots` 图标 + `var(--muted)`」，hover 走设计 `.op-btn:hover`（accent 底 + accent 字 + accent 30% 边）。删除 `MoreOutlined` 引用与 `⋯` 文本两套实现。
- **守卫**：`NodeList.source.test.ts` 现有「StrokeIcon + MoreOutlined」断言需反转（约定 #217 先出清单）。

## 二、用户项 ②：更多菜单未按设计页分栏 / 未加解释 / 危险项未标红

| 量测 | 设计 | 实现 · 节点页 | 实现 · 路由/上游页 |
|---|---|---|---|
| 条目顺序 | 详情｜编辑｜复制｜数据库对比 ─分隔─ **删除** ─分隔─ 安装×4 | 详情｜编辑｜复制｜**删除**｜数据库对比 ─分隔─ 安装×4 | 编辑｜版本管理(说明)｜复制｜**删除** |
| 危险项分栏 | **前后各一条分隔线**（独立一栏） | **无**（混在 CRUD 序列中） | **无**（末位无分隔线） |
| 危险项标红 | `oklch(55% 0.18 28)` + 说明行 | **无红、无说明** | 有红 + 有说明 ✓ |
| 菜单宽 | `min-width: 215px`（内容超出即换行） | 240.9（无 min-width，被说明撑宽） | 292.8（同因） |
| 分隔线 | `border-top: 1px solid var(--border)`，`margin: 4px 6px` | **1px 底色块 `rgba(5,5,5,.06)`，`margin: 4px 0`** | 同左 |
| 条目高 | 32.2（line-height 1.4 → 18.2 + 14 内距） | 34.4（antd 行高 22px） | 同左 |

- **根因**：
  1. 节点页菜单由 `composables/useClusterNodes.ts` 的 `allNodeActionButtons` **配置驱动 `v-for`** 渲染，该配置只有 `title/shortTitle`，**没有 `danger` / `desc` 元数据**——所以「删除」天然丢失红色与解释，「数据库对比」也跟随数组序排到删除之后。
  2. 路由/上游页是手写菜单，危险项已 `danger` + `menu-item-stack` 说明，但**没有分栏分隔线**；三页的分隔线形态（底色块 + 4px 0 边距）与设计（1px 边线 + 4px 6px 边距）都不同。
  3. 说明行按 `action-menu-explanations` 规格「后果重且点击前不可见」本应携带（删除可同步删 Edge 配置，弹窗才可见）——节点页缺失属既有规格一处漏网，不是新需求。
- **建议**：
  1. `allNodeActionButtons` 增可选 `danger` / `desc` 字段，`useClusterNodes` 侧填写（删除 → `danger` + `desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）'`），NodeList 模板据此渲染 `danger` 与 `menu-item-stack`；
  2. 菜单分组按设计：CRUD 组（详情/编辑/复制/数据库对比）→ 分隔线 → 危险组（删除）→ 分隔线 → 安装组；路由/上游页同为「… → 分隔线 → 删除」；
  3. 全局菜单样式补齐（`style.css` Dropdown 段，单点）：`min-width: 215px`、条目 `line-height: 1.4`（条目高 34.4 → 32.2）、分隔线 `margin: 4px 6px` 且用 `border-top: 1px solid var(--border)` 形态。
- **决策点 D-1（菜单宽）**：`min-width: 215px` 下长说明会折成两行（设计页即如此：删除说明两行）；
  备选是保持内容自适应（说明单行，菜单 244–293 宽）。**建议照设计（215 + 换行）**，三页统一。

## 三、用户项 ③：状态胶囊比设计页小；「已禁用」应为虚线描边

| 量测 | 设计 | 实现 | 判定 |
|---|---|---|---|
| 字号 / 字重 | 11px / 600 | 11px / 600 | ✓ 一致 |
| 高度 / 圆角 | 20px / 999px | 20px / 999px | ✓ 一致 |
| 圆点 | 6px | 6px | ✓ 一致 |
| 字距 | 0.11px | 0.11px | ✓ 一致 |
| **左右内距** | `0 8px` | **`0 5px`** | ✗ 每枚窄 6px（已停止 60.3 → **54.3**） |
| **已禁用形态** | 透明底 + **1px 虚线** `oklch(50% .018 240/.4)` + **无圆点** + `title` 提示 | **中性灰实底 + 6px 灰点**、无 `title` | ✗ 形态错误 |

- **根因**：
  1. 内距 5px 是 r3-5 为把「已禁用 + 已停止」两枚塞进 **140px** 状态列而做的收紧；r4-E2 已把状态列改回设计值 **147px**（可用内容宽 123px），而设计两枚并排只需 `51.3 + 4 + 60.3 = 115.6px` —— **收紧的前提已消失，属遗留**。这就是「标签与字看起来小一号」的实测来源（字与高一致，胶囊本体窄 6px）。
  2. `BadgeStatus` 只有 `online/offline/warning/info/neutral` 五态，节点页把「已禁用」映射到 `neutral`（= 未知态的灰实底 + 灰点）。设计把「已禁用」定义为**管理开关态**（非健康态）：空心虚线胶囊、无圆点、带语义 `title`（"管理开关已禁用：不承载业务流量，仍可执行节点任务与状态查询"）。
- **建议**：
  1. 删除 r3-5 的 `padding: 0 5px` 收紧，回到设计 `0 8px`（状态列 147px 已验证放得下）；
  2. `BadgeStatus` 增 `status="disabled"` 变体（透明底 + 1px dashed + 无圆点 + `title` 透传），消费点三处：节点页行内、节点详情弹窗、统一管理 Tab 节点表（`ClusterNodes.vue`）——同语义同形态，避免第二个页面继续错。
  3. 若批准后你仍觉得字号偏小：那是 **11px 基准本身**（与设计一致）。需要更醒目只能改基准（如 11→12px），届时须同步改设计页，否则每轮 parity 都会报差——**建议不动基准**。

## 四、逐元素扫描的新发现（本轮附带，均未被提出）

| # | 元素 | 设计 | 实现 | 建议 |
|---|---|---|---|---|
| 4.1 | 序号列 `#` | mono 12px、muted（`.c-idx`） | 13px 正文字体（`text-muted`） | 加 `.l5-card` 作用域 `.c-idx` 等价规则（mono 12px） |
| 4.2 | 安装路径值 | muted（`.c-dim`） | `var(--fg)` 全黑 | 路径值回落 muted（`path-v`） |
| 4.3 | 行内动作按钮字重 | 400 | **500**（全局 `.btn`） | L5 作用域内 `.node-actions-wrap .btn { font-weight: 400 }` |
| 4.4 | 表头行高 | 38px | **41px** | 选择列表头 antd 复选框行盒 22px 撑高（th 内距两侧实测同为 `9px 12px`；把表头复选框行盒收到 16–19px 后实测 41→39，目标 38） |
| 4.5 | 页头描述上距 / h1 行高 | 2px / 31.5px（1.5×21） | 4px / 27.3px（1.3×21） | PageHeader 单点：描述 `margin-top: 2px`、h1 `line-height: 1.5` |
| 4.6 | 行高（数据行） | 61.5px | 62.5px | 1px 级，建议接受（不单独立项） |

## 五、讨论项：分组模式下的「全部展开 / 全部收起」

**现状**：分组默认全展开；折叠状态由 `useListClusterGrouping` 的 `foldedKeys`（按 `groupKey`）保存，跨「分组/平铺」切换与翻页保留；只有组头 chevron 单个折叠，**没有批量入口**。集群管理页已有「全部展开/全部收起」两枚上下文按钮（`ClusterList.vue` `hasCollapsed/hasExpanded`）。

### 方案（含推荐）

- **方案 A（推荐）· 工具条单按钮，上下文切换**
  工具条右簇「列配置」与「分组|平铺」之间插一枚 `tool-btn`，仅分组模式显示；当页全展开时显示「全部收起」，存在折叠时显示「全部展开」（图标 = 双线 chevron 上/下）。
  - 优点：与集群管理页语义一致；只占 1 个钮位；与「分组」强相关、位置就在模式切换器旁。
  - 代价：工具条右簇顺序标准需更新（筛选 → 计数 → 刷新 → 列配置 → **批量折叠** → 分组|平铺）。
- **方案 B · 双按钮常驻**：全部展开 + 全部收起各一枚，都常驻（集群管理页现形态）。更直白但占 2 个钮位，且在 1310px 卡宽下与列配置、切换器挤在一起。
- **方案 C · 并入「分组|平铺」seg 作第三段**：不推荐——把「视图模式」与「折叠动作」混为一谈，且 seg 是三页共用样式，语义会被误读。
- **方案 D · 组头右端挂「收起全部」小链接**：不推荐——位置随滚动、不可预期；组头右端在设计里已放「勾选节点后可用上方批量操作」提示。

### 语义细节（推荐取默认）

1. **作用范围 = 当页已加载的组**：「全部收起」把当页所有 `groupKey` 加入 `foldedKeys`；翻页后新出现的组默认展开（与集群管理页一致，避免翻页后空白页）。
2. **「全部展开」清空全部折叠记忆**（含其他页的 `groupKey`）——字面语义即「全都展开」。
3. **折叠状态不持久化到 localStorage**（现状即如此），刷新回默认全展开。
4. **落点**：`useListClusterGrouping` 增 `expandAll() / collapseAll() / hasFolded`（纯函数，可单测），三页工具条接线；节点/上游/路由 **同批**落地（同一 composable，三页同形）。
5. **设计页同步**：设计页目前没有这枚按钮。若批准，需同步在 `nodes.html / upstreams.html / routes.html` 的工具条补上同一形态，否则后续每轮 parity 都会把它当「多余元素」报差——**这是本方案唯一需要改设计稿的地方**。

---

## 六、已核对一致的项（证明逐元素扫过，非只查报告项）

统计徽标（字号/字重/字距/高度）、页头 h1 字号字重、卡片底色与圆角、工具条控件宽度（搜索 150 / 下拉 104·120·104）、工具钮、`分组|平铺` seg（激活/未激活配色与高度）、批量条（has-sel 底 6% / 数字 accent / 空格分隔符）、表格列宽（#48 / IP149 / 端口 82 / 管理端口 82 / 安装路径 377 / 状态 147 / 版本 87 / 操作 298 = 1310 无溢出）、表头 11px/600 无大写、th/td 内距（9/12、10/12）、无竖线、悬停 accent 4%、组头与表头同色（`var(--bg)`）、组头 chevron 13px、组内芯片、`path-k` 标签（10px/700 mono、8% 底、3px 圆角）、v-sep（1×14）、外置分页条（28×28 页码、当前页实心 accent、跳至输入框）。

**白名单（不报差）**：字体族的系统回退（设计声明 `SF Pro Text`、实现声明 `Segoe UI`，本机均回退到同一字体）、antd 组件壳内部结构、滚动条、数据差异导致的文本宽度差。

**范围外观察（另议，本轮不动）**：设计页左栏为 240px 常显菜单；实现页为分组折叠导航（仅展开当前所在分组，其余为组标题）。属全站导航范畴，与三个列表页视觉无关，若要向设计页对齐应另立变更。

## 七、批准后拟写入规格（spec delta 草案要点）

1. `list-page-console-visual` 增「操作列与动作菜单解剖」：触发器 = 12px 横排三点 stroke 图标 + 无边框 26×24；菜单 = `min-width 215`、条目 13/600 + 说明 11/400 muted、危险项独占一栏（前后分隔线）、危险项主文案红、说明保留灰；分隔线 1px 边线 `margin 4px 6px`。
2. `list-page-console-visual` 增「状态胶囊语义四态 + 管理开关态」：运行中/已停止/未检测为实底胶囊，**已禁用为空心虚线胶囊（无圆点）+ `title` 语义**，全局 `BadgeStatus` 单点，任何展示「管理开关关闭」的列表 SHALL 使用该变体。
3. `list-page-cluster-grouping`（另一变更，需同批同步）增「批量折叠控制」：分组模式 SHALL 提供全部展开/全部收起的工具条入口（方案 A 形态），作用范围为当页已加载组，翻页新组默认展开。
4. `mockup-parity-verification` 增「逐元素扫描清单」：每轮 parity SHALL 覆盖页头/工具条/表头/单元格/组头/状态格/操作列/菜单/分页条九个子域，并在清单中单列「已核对一致项」，避免只核对用户提出的项（本轮 6 项新发现即为例证）。

## 八、实施批次（批准后）

| 批次 | 内容 | 风险 | 验证 |
|---|---|---|---|
| B1 | 状态胶囊：移除 5px 收紧 + `BadgeStatus` 增 `disabled` 变体（3 消费点） | 低（共享组件，27 消费方需 grep 断言） | 组件单测 + 三处真机截图 + 全量单测 |
| B2 | 操作列触发器三页统一 `dots` + 无边框 26×24 | 低 | 源码守卫反转（NodeList.source）+ 三页截图 |
| B3 | 菜单：节点页 danger/desc 元数据 + 三页分组与分栏 + 全局菜单样式（min-width/行高/分隔线） | 中（配置驱动菜单，需覆盖 27 处 a-menu 消费） | 三页菜单截图 + 菜单相关既有测试 |
| B4 | 4.x 微差（序号 mono、路径 muted、按钮 400、表头行高、页头描述/行高） | 低 | tableAnatomy 守卫 + 三页截图 |
| B5 | 讨论项（若批准）：`expandAll/collapseAll` + 三页工具条 + 设计页补按钮 | 中（新增交互 + 设计稿同步） | 新增单测 + 真机折叠/翻页语义验证 |

---

## 九、实施记录（2026-11-17，用户全批裁决后落地）

### 9.1 改动清单

| 文件 | 改动 |
|---|---|
| `components/StrokeIcon.vue` | 增 `dots`（三圆横排实心，`FILLED_ICONS` 例外集）、`expandAll` / `collapseAll`（双线 chevron）；模板按 `filled` 切换 `fill/stroke` |
| `components/BadgeStatus.vue` | 增 `disabled` 变体（透明底 + 1px dashed + 无圆点）、`title` 透传；圆点改为 `v-if="status !== 'disabled'"` |
| `components/TableToolbar.vue` | 增 `#mode-extra` 槽（顺序：… → 列配置 → mode-extra → 分组\|平铺） |
| `components/PageHeader.vue` | h1 `line-height: 1.5`（31.5px）、描述 `margin-top: 2px` |
| `composables/useListClusterGrouping.ts` | 增 `pageHasFolded` / `expandAll` / `collapseAll` / `toggleFoldAll`（`collapseAll` 与跨页折叠取并集） |
| `composables/useClusterNodes.ts` | `NodeActionButton` 增 `danger` / `desc`；`delete` 项填 `danger: true` + 删除说明 |
| `views/NodeList.vue` | 触发器 → `StrokeIcon dots`；菜单按 `menuSafeActions` / `menuDangerActions` 分栏渲染（危险组 `danger` + `menu-item-stack`）；序号列 `c-idx`；路径值 muted；工具条 `#mode-extra` 折叠钮；已禁用 → `status="disabled"`（行内 + 详情）；`关联新 OpenResty` / `升级 Edge 小版本` 文案对齐设计 |
| `views/RouteList.vue` / `UpstreamList.vue` | 触发器 → `StrokeIcon dots`（页内 scoped 触发器解剖退场，改由 style.css 单点）；菜单挂 `l5-action-menu` + 删除项前分隔线；工具条折叠钮 |
| `views/clusters/ClusterNodes.vue` | 已禁用 → `status="disabled"`（Tab 与独立页同形） |
| `style.css` | 撤销 `padding: 0 5px` 胶囊收紧；触发器合并规则（`.node-actions-wrap` + `.action-cell`，压过全局 `ant-btn` 的 `!important`）；`.c-idx`；按钮 400 字重；表头选择列块级化 19px；`.l5-action-menu`（215 宽 + 行高 1.4）；分隔线单点（1px 边线 + 4px 6px）；折叠钮窄屏收敛（≤1400 纯图标、≤1299 隐藏） |
| `styles/theme.css` | `.menu-item-stack` 去 2px 纵向内距（两行式条目高 68 → 64 = 设计值） |
| `docs/ui/Live-Artifact-5/proposal-c/{nodes,upstreams,routes}.html` | 工具条同步补「全部展开/全部收起」按钮（可点击演示，初始文案按实际折叠态） |
| `docs/ui/Live-Artifact-5/proposal-c/nodes-group-toggle-demo.html` | 新增：批量折叠三方案对比示例页 |

### 9.2 复测对照（`final-verify.mjs`，设计 vs 实现）

| 项 | 设计 | 实现 | 判定 |
|---|---|---|---|
| 触发器盒/形态 | 26×24、边框透明、底透明、radius 4 | 同 | ✓ |
| 触发器图标 | 12×12，圆 `5,12 / 12,12 / 19,12` | 同 | ✓ |
| 已停止胶囊 | 60.3×20、`0 8px` | 同 | ✓ |
| 已禁用胶囊 | 51.3×20、透明底、1px dashed、0 圆点 | 同 | ✓ |
| 表头 th | 149×38、`9px 12px` | 同 | ✓ |
| 菜单宽/条目/分隔线 | 215；`32.2/32.2/32.2/32.2/64/48.6/48.6/64/48.6`；`1px + 4px 6px ×2` | 同 | ✓ |
| 菜单序列（含危险标记） | 详情/编辑/复制/数据库对比/删除*/安装 OpenResty/安装 Edge/关联新 OpenResty/升级 Edge 小版本 | 同 | ✓ |
| 危险项主文案色 | `oklch(0.55 0.18 28)` | 同 | ✓ |
| 三页触发器 | 26×24、无边框透明、dots 12px | 三页同 | ✓ |
| 三页菜单 | 215 宽、`l5-action-menu`、危险项末位 | 三页同（路由/上游各 1 条分隔线，与设计一致） | ✓ |
| 分组折叠 | — | 三页：收起→0 数据行 + 文案切「全部展开」；展开→复原 20 行 | ✓ |

### 9.3 断言反转清单（约定 #217）

| 用例 | 反转内容 |
|---|---|
| `NodeList.source.test.ts` | 「更多菜单保留 antd MoreOutlined」→ 断言 `StrokeIcon name="dots"` 且 **不含** `MoreOutlined` |
| `mockupParity.source.test.ts` r3-5 | 「style.css 存在 `.status-cell .badge-status { padding: 0 5px }」→ 断言 **不存在**（r5 撤销） |
| `mockupParity.source.test.ts` r4-② / r5-① | 触发器解剖正则改为合并选择器（`.node-actions-wrap … , .action-cell …`），并断言两页共用一条规则 |
| `NodeList.test.ts` / `ClusterNodes.test.ts` | 「已禁用 = `badge-neutral`」→ `badge-disabled` + `title` 含「管理开关已禁用」 |

新增用例：`mockupParity.source.test.ts` r5 段 9 例、`useListClusterGrouping.test.ts` 批量折叠 4 例、`BadgeStatus.test.ts` disabled 2 例。

### 9.4 实施期发现的额外问题（已修）

1. **路由/上游触发器 scoped 规则从未生效**：全局 `.ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous) { border: 1px solid var(--border) !important; background: var(--surface) !important }` 的特异性（3 个类级）高于页内 `.action-trigger-btn[data-v-x]`（1 类 + 1 属性），故两页长期带 1px 边 + 白底。改为 `style.css` 单条合并规则（5 类级）压过，页内重复解剖退场。
2. **`.menu-item-stack` 的 2px 纵向内距**使两行式条目比设计高 4px（68 vs 64），去掉后逐值命中。
3. **文案空格**：实装为「关联新OpenResty / 升级Edge小版本」，设计为「关联新 OpenResty / 升级 Edge 小版本」——已对齐（节点页 + 统一管理 Tab 同步，含执行抽屉标题）。

### 9.4.1 实施期额外问题（续）

4. **折叠钮把路由页工具条推溢出**：新增钮（图标+文字 88px）在 1366px 宽使路由页工具条溢出 33px（「分组|平铺」被裁）。修法 = 窄屏收敛：`≤1400px` 只留图标（`title` 提供文案，宽 35px）→ 1366 起 0 溢出；`≤1299px` 整钮隐藏。实测 1400/1366/1280/1200 四档：节点与上游三档 0 溢出；路由页在 1280/1200 的溢出量（23px / 103px）与**加入本钮之前完全一致**——即该宽度带的工具条溢出自成问题，不由本钮承担（另议）。

### 9.5 已接受残差

- 数据行高 62.5 vs 设计 61.5（1px，源自两行路径栈的行盒；不影响观感，不立项）。
- 工具条 gap 8px vs 设计 6px（1px 级布局差，未列入本轮）。
- 路由页工具条在 ≤1280px 已有溢出（1280 差 23px、1200 差 103px，与本轮改动无关，本轮仅保证不加剧）——该宽度带的自适应另立。
- 字体族声明的系统回退差异（设计声明 `SF Pro Text`、实现声明 `Segoe UI`，本机回退到同一字体）——白名单。

### 9.6 收口状态

- 全量单测：`npx vitest run --maxWorkers=4` → **213 files / 2951 passed 全绿**（此前数轮出现 `DbBackupRestoreWizard.ux`、`ServerCertList`、`ClusterFormModal`、`RouteFormModal`、`EdgeAutostartGroupFilter`、`Tools` 轮换各挂 1 例，**均未被本轮改动触及、隔离复跑全绿**——约定 #58 的 CPU 争抢型波动；最终轮全绿）。
- `npx vue-tsc -b` 0 error；prettier 全部通过；`openspec validate`：`mockup-parity-standard` / `list-pages-console-restyle` 均 valid。
- 截图存档：`screenshots/{design,impl}-parity-nodes-r5{,-menu}.png`、`impl-parity-{upstreams,routes}-r5.png`。
