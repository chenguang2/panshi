# 统一管理页（CentralList）parity 审计 r1

- 日期：2026-11-21
- 基线：`docs/ui/Live-Artifact-5/proposal-c/central.html`（状态一 卡片网格 / 状态二 最大化面板）
- 方法：Playwright 同视口 1600×1000 双侧打开（设计页 `file://`，实现页登录后 `/central-management`），对同一批元素取 `getComputedStyle` + `getBoundingClientRect`，颜色经 canvas `fillStyle` 归一。脚本与原始数据：`/tmp/opencode/parity-central/{audit.mjs,probe1.mjs,raw.json,diff.json,design-grid.png,impl-grid.png,design-max.png,impl-max.png}`。
- 数据差异不计入（集群名/集群数/节点数/版本号/描述有无）；卡片高度、`lp-body` 高度随之变化。
- 严重度：P0 = 样式未生效/破损；P1 = 结构成组差异；P2 = 细节差异；D = 实现有意不同于设计页（需回填设计页或裁决）。

## 一、P0（破损，建议必修）

### P0-1 卡片「发布状态」胶囊完全没有样式

| | 设计 | 实现 |
|---|---|---|
| 字号/字重 | 11px / 600 mono | 14px / 400 正文字体 |
| 背景 | `oklch(0.55 0.15 145 / 12%)` 淡底 | `transparent` |
| 圆角 | 999px | 0 |
| 高宽 | 20px / 49px | 21px / 42px |

- 证据：实现 `.lp-status .ps-tag.ps-pub` 实测 `radius:0`、`bg:transparent`、`fs:14px`——即渲染为纯文本「已发布」。
- 根因：胶囊本体样式只存在于 `components/PublishStatusTag.vue` 的 scoped 样式（`.ps-tag/.ps-published/...`）；`ClusterCard.vue` 第 12 行内联写了 `<span class="ps-tag" :class="'ps-pub'/'ps-unpub'">`，未使用该组件，scoped 样式不生效；`style.css` 也刻意未声明胶囊（见 1851 行注释）。
- 影响面：`ClusterCard` 被集群管理（ClusterList）与统一管理（CentralList）共用 → 两页同缺陷。
- 建议修法（推荐 A）：把 `.ps-tag` 胶囊基类 + `.ps-pub/.ps-unpub` 下沉到 `style.css`「发布区原语」段（与 `.diff-btn`/`.ps-date` 同处单点），`PublishStatusTag.vue` 保留自身语义色不变。B 方案（改调组件）会改变当前文案（`配置 vN`/`已发布` → 组件四态文案），需另议。

### P0-2 卡片离线提示条被全局 `.alert` 覆盖

| | 设计 `.lp-notice` | 实现 |
|---|---|---|
| 高 | 29.4px | 63.7px |
| 内距 | 5px 8px | 12px 16px |
| 字号/gap | 12px / 7px | 13px / 10px |
| 圆角 | `--radius-sm`(4px) | `--radius-md`(6px) |

- 根因：`ClusterCard.vue` 第 44 行同时挂了 `alert alert-warning`；`style.css` 中 `.alert`(3606) 在 `.lp-notice`(3295) 之后、同权重（单类），后到者覆盖 padding/radius/font-size/gap/margin-bottom。
- 建议修法：去掉 `alert alert-warning` 两个类，给 `.lp-notice` 补自有 warning 变体（背景/边框/前景三值取自 `.alert-warning`），既保留语义又不再被覆盖。
- 附带：设计提示条右端有内联动作 `连接测试`（`.n-act`），实现无（见 D-4）。

## 二、P1（最大化面板结构差异）

### P1-1 mini-bar 容器
- 设计：`background: --bg`（`oklch(0.97 0.005 250)`）、无圆角、上下各 1px 边框、内距 `10px 16px`、高 54.2px、无外边距。
- 实现：白底、`radius 8px`、仅下边框（无）、内距 `6px 12px`、高 46px、`margin-bottom 12px`。
- 根因：`CentralList.vue` scoped `.cluster-mini-bar`（27 行）。

### P1-2 mini-item 胶囊
- 设计：`radius 999px` + 1px 边框 + `--surface` 底 + muted 字 400；active = accent 30% 边 + `--accent-bg` 底 + accent 字 **600**；高 30px、内距 `5px 12px`。
- 实现：`radius 6px` + 透明边 + `--bg` 底；active = **实心 accent 底 + 白字 500**；高 28px、内距 `4px 10px`。
- 根因：`CentralList.vue` scoped `.mini-item`（70 行）。

### P1-3 mini-hint（集群标识弱化字）
- 设计：10.5px、mono、`opacity .8`；实现：11px、正文族、`opacity .6`。

### P1-4 收起按钮
- 设计：`.btn.btn-ghost`「× 收起」，13px/500、内距 `6px 14px`、高 32.2px、透明底。
- 实现：自定义 `.restore-btn`「退出最大化」，12px/400、内距 `4px 12px`、高 28px、`--bg` 底 + 1px 边。

### P1-5 页签缺图标 + active 态不同
- 设计：7 个页签各带 13px 线性图标（`gap 7px`，`inline-flex`）；active = **2px accent 上边** + accent 边 + `--accent-bg` 底 + `padding 6px 13px 7px`（宽 142.9px）。
- 实现：纯文本（`display:block`，无 gap）；active = 1px `--border` 边 + `--bg` 底，靠 `::after` 画 2px accent 线（宽 119.8px）。
- 根因：`CentralList.vue` scoped `.dt/.dt.active`（impl 版）对照 central.html 内联 `<style>` 的 `.dt` 段。

### P1-6 页签计数胶囊 `.db`
- 设计：mono 11px、内距 `1px 6px`、`--surface` 底 + 1px 边框 + muted 字；active = accent 淡底 + accent 字 + accent 30% 边；高 20.5px。
- 实现：正文字体、`--bg` 底、**无边框**、`margin-left 4px`；高 15px。

### P1-7 名称行动作按钮
- 设计：`.btn`（13px、内距 `6px 14px`、宽 56px），高度受 `.max-name-row .btn{height:28px}` 限制为 28。
- 实现：`.btn-sm`（12px、内距 `3px 10px`、宽 46px），同 28 高。
- 影响：一排 6 个按钮整体偏窄偏小。

### P1-8 名称行集群标识带括号
- 设计：`<span class="chint">prod-a</span>`；实现：`<span class="chint">({{ name }})</span>`（`ClusterList` 同一处模板另有同名逻辑）。

## 三、P2（细节）

### P2-1 统计格「满健康」缺绿色
- 设计：节点格满健康时 `.sv.ok` 绿（`oklch(0.55 0.15 145)`）；实现 `healthCls` 只返回 `is-danger`/`is-warning`，满健康为默认前景色（实测 `oklch(0.2 0.02 240)`）。
- 根因：`ClusterCard.vue` 198-204 行；设计把颜色挂在 `.sv` 上，实现挂在 `.stat-cell` 上且无「ok」分支。

### P2-2 「已启用」状态胶囊细节
- 设计：`.ps-tag.ps-pub`（mono 11px/600、radius 999px、淡底 12%、高 20px）。
- 实现：`.badge.badge-success`（正文族 11px、radius 10px、淡底 10%、高 20.5px）。
- 结论：语义一致，仅字体族/圆角/底色浓度不同。

### P2-3 页头操作按钮缺图标
- 设计：备份下载/从备份导入/新建集群 各带 13px 线性图标（宽 101px）；实现纯文字（宽 82px，其余 padding/字号/高一致 32.2px）。
- 备注：全站「页头按钮带图标」尚未推广，非本页独有。

### P2-4 页头对齐
- 设计 `.page-header{align-items:center}`；实现 `flex-start`（标题两行 + 按钮组的垂直基准差 ~10px，视觉轻微）。

## 四、D（实现有意优于/不同于设计页，需回填或裁决）

- **D-1 工具栏「刷新」按钮**：实现有（TableToolbar 恒渲染），设计页无 → 建议回填设计页（#298 约定：设计稿没有的实现元素必须补进设计稿）。
- **D-2 卡头「最大化」chip**：实现有（D2 已裁决保留；入口 = 统计格 + 卡头），设计页无 → 建议回填设计页。
- **D-3 「直连」路径徽章**：设计页每张卡都画路径徽章（`直连` / `经中继 · aoh`）；实现按 cluster-ux-close-loop 3.4「直连是缺省态、徽章即噪音」只在经中继时渲染 → 建议设计页删掉 `直连` 徽章。
- **D-4 提示条内联「连接测试」动作**：设计有，实现无（连接测试在卡片脚与名称行各有一处）→ 二选一：补进实现，或从设计页删。

## 五、已核对一致项（不报差）

面板（`.l5-card` 1310×、圆角 8、1px 边）；工具条（高 57、内距 `12px 16px`、gap 6、控件高 30、搜索 150、分组下拉 104）；状态 chips 行（高 41、内距 `9px 16px`、chip 22px/12px、计数 mono 11px）；分组 band（高 40、内距 `8px 12px 8px 16px`、数量胶囊、chevron 13px）；卡片容器（宽 415.3、圆角 8、1px 边、shadow-sm）；`lp-head`（内距 `11px 14px`、标题 15px/600、tech 标签 10.5px/19px）；`lp-body`（内距 `7px 14px`、gap 4、行 12.5px、键 11.5px）；node-chip（高 20、内距 `0 8px`、10.5px mono）；stat-grid（7 列、gap 6、margin `0 14px 4px`）；stat-cell（内距 `7px 2px 6px`、高 65、圆角）；`sv` 15px/700 mono、`sl` 10.5px；`lp-foot`（内距 `7px 14px`、顶部 1px 线、按钮 `btn-sm` 24.8px/12px 与设计完全一致）；card-grid（3 列、gap 14）；页头 h1 21px/600、描述 13px、ph-lite 徽标、页头高 53。

## 六、修复与复测（2026-11-21，用户批准「全部修复」+「提示条连接测试补进实现」）

同一脚本复测（`/tmp/opencode/parity-central/audit.mjs`，复测截图 `impl-grid.png` / `impl-max.png` / `design-grid.png`）：

| 编号 | 结论 | 落点 |
|---|---|---|
| P0-1 发布胶囊 | ✓ 已修 | `style.css` 新增 `.ps-tag/.ps-pub/.ps-unpub` 胶囊单点（PublishStatusTag 与 ClusterCard 共用）；实测 11px/600 mono、20px 高、12% 淡底与设计一致 |
| P0-2 提示条 | ✓ 已修（结构 + 配色） | `ClusterCard` 去掉 `alert alert-warning`、提示条移出 `.lp-body`（宽度回 385.3 = 设计）、新增 `.lp-notice.warn` 语义色；实测内距 5/8、12px、radius-sm 与设计一致 |
| P1-1 mini-bar | ✓ 已修 | `CentralList` scoped `.cluster-mini-bar`（--bg 底 + 上下双线 + 10/16 内距，高 54） |
| P1-2 mini-item | ✓ 已修 | 999 胶囊 + 1px 边 + active 淡 accent/600 |
| P1-3 mini-hint | ✓ 已修 | 10.5px mono / opacity .8 |
| P1-4 收起按钮 | ✓ 已修 | 「× 收起」13px/500、6/14、透明底（设计 `.btn-ghost`） |
| P1-5 页签 | ✓ 已修 | 7 页签补 13px 线性图标；active = 2px accent 上边 + accent 淡底 + 6/13/7 内距 |
| P1-6 计数胶囊 | ✓ 已修 | mono 11px + 1px 边 + active accent 三件套 |
| P1-7 名称行按钮 | ✓ 已修 | 去 `btn-sm` → 13px/6·14（高 28 保留） |
| P1-8 chint | ✓ 已修 | 去括号，与设计同形 |
| P2-1 满健康绿色 | ✓ 已修 | `ClusterCard` 新增 `statHealthCls`（is-ok）+ `.stat-cell.is-ok .sv` 绿 |
| P2-2 已启用胶囊 | ✓ 已修 | `.cl-card .lp-status .badge` 对齐 mono 11/600 + 999 圆角 |
| P2-3 页头图标 | ✓ 已修（两页） | `StrokeIcon` 增 `download/plus`，统一管理 + 集群管理页头三按钮补图标（同级页面一致性）；其余页头仍是纯文字 → 建议随「全站页头图标」另立项 |
| P2-4 页头对齐 | ✓ 已修 | `PageHeader` `align-items:center` |
| D-1 刷新 | ✓ 已回填 | `central.html` 工具条补「刷新」 |
| D-2 最大化 chip | ✓ 已回填 | `central.html` 两卡补 `.maximize-btn-sm` |
| D-3 直连徽章 | ✓ 已删设计页 | 卡片与名称行的 `直连` 徽章移除；最大化名称行徽章改为按 mini-item 数据动态显示（仅中继） |
| D-4 提示条连接测试 | ✓ 已补实现 | `ClusterCard` 新增 `.n-act` → `emit('test')`，两页 `@test="testCluster(...)"`；单测钉住 |

复测剩余差异（均判定为非缺陷，保留）：

1. 提示条高度 46.8 vs 29.4——文案长度差异（实现带端口 `192.168.0.235:80`，设计样例只写 IP），几何已同；若要单行需改文案或给设计样例补端口（未裁决，不改）。
2. `.ph-lite` 字体族声明链：设计继承 `--font-display`（在 h1 内），实现继承 `--font-body`（h1 兄弟节点）。本机无 SF Pro，渲染不可见；属全站共享类，改动波及 20+ 页，建议并入「全站图标/字体一致性」专项。
3. 工具栏原生 input/select 字体：设计页原生控件回落 Arial，实现用正文字体（实现更正确，保留）。
4. `card-grid` `align-items: normal ≡ stretch`；`band-cards display:contents` 等价——无视觉差。
5. `dt/db` 宽度 0.06px 级子像素差；`mini-item/cname/chint` 宽度差 = 集群名数据长度。
6. 审计脚本对「更多 ▾」选择器错位（设计匹配到 `更多`、实现匹配到 `删除`），非真实差异。
7. `.restore-btn` 保留 `flex-shrink:0`（保护性，无视觉差）。
