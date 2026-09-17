# 磐石 Gateway 后台风格优化与统一设计方案

> 适用范围：磐石 Gateway 管理前端（Vue 3 + Ant Design Vue 4）。
> 目标：在不推翻现有技术栈与组件库的前提下，把已经存在的"事实标准"收敛为"明文标准"，消除两派漂移，并为运维场景与深色模式补齐规范。
> 本方案与代码冲突时，以代码为准并回改本文档。

---

## 0. 现状盘点

### 0.1 已有地基（保留并强化）

| 资产 | 位置 | 状态 |
| --- | --- | --- |
| 设计令牌（OKLCH 色板/字体/圆角/阴影/侧栏宽度） | `frontend/src/styles/theme.css` | 单一事实源，有 `tokens.test.ts` 守卫 |
| 全局样式契约（btn/card/table/form 族） | `frontend/src/style.css`（1012 行） | 列表页/表单页机械属性已对齐 |
| 布局骨架 | `views/DefaultLayout.vue` + `components/AppSidebar.vue` | 侧栏 240px 可收起 + 56px 顶栏 + `.app-content`（20px 24px） |
| 页头 | `components/PageHeader.vue`（h1 22px + 描述 13px + actions 插槽） | 新页面已统一使用 |
| 状态徽章 | `components/BadgeStatus.vue`（online/offline/warning/info 四态） | 运维组件规范化基础 |
| 弹窗三层制 | `useOverlayModal` / `AppModal` / 视图内联（约定 #25） | 明文规则，保留 |
| CRUD 十件套 | `useClusterResourceCore.ts`（约定 #24） | 禁止复制，保留 |

### 0.2 主要债务（本方案要收敛的漂移）

1. **留白两派**：部分页面根元素又加 `padding: 20px 24px`，与 `.app-content` 叠加成双倍留白（h1 x=264 vs x=288）。
2. **表格两派**：表头样式存在 A 派（素色）与 B 派（品牌色底）并存；行分隔线两派已于 2026-09 统一为"有"。
3. **CSS 重复**：jscpd 检出 37 个重复块 / 1888 行（页面级 scoped 样式互相抄）。
4. **语义色阶缺失**：token 只有主色一档，hover/active/bg 底色各页面自己 color-mix，深浅不一。
5. **深色模式未建**：单主题，`themeStore` 只管侧栏收起。

---

## 1. 视觉规范统一

### 1.1 色彩体系

所有颜色以 `theme.css` 的 OKLCH 令牌为唯一事实源。下表为现行值 + 新增令牌建议（✚）：

| 令牌 | 现值 / 建议值 | 用途 |
| --- | --- | --- |
| `--accent` | `oklch(56% 0.16 210)`（青蓝） | 品牌主色：主按钮、链接、选中态、表头底线、聚焦边框 |
| ✚ `--accent-hover` | `oklch(50% 0.16 210)` | 主按钮悬停（同色相降 L） |
| ✚ `--accent-active` | `oklch(45% 0.15 210)` | 主按钮按下 |
| ✚ `--accent-bg` | `oklch(56% 0.16 210 / 10%)` | 选中行/页签底、品牌表头底（现散落的 color-mix 收编） |
| `--success` | `oklch(55% 0.15 145)` | 成功、在线、发布完成 |
| ✚ `--success-bg` | `oklch(55% 0.15 145 / 12%)` | 成功提示底色（如迁移结果条） |
| `--warning` | `oklch(65% 0.15 85)` | 警告、迁移中、待处理 |
| ✚ `--warning-bg` | `oklch(65% 0.15 85 / 12%)` | 警告横幅底色 |
| `--danger` | `oklch(55% 0.18 28)` | 删除、失败、离线 |
| ✚ `--danger-bg` | `oklch(55% 0.18 28 / 10%)` | 危险确认/失败底色 |
| `--info` | `oklch(55% 0.12 240)` | 提示、只读说明 |
| `--bg` | `oklch(97% 0.005 250)` | 页面底 |
| `--surface` | `oklch(100% 0 0)` | 卡片/顶栏/弹窗面 |
| `--fg` / `--muted` | `oklch(20% …)` / `oklch(50% …)` | 主文字 / 次要文字（辅助文字一律 `--muted`，禁止再引入第三档灰） |
| `--border` | `oklch(88% 0.008 240)` | 全部 1px 边框与分隔线 |
| 侧栏族 | `--sidebar-bg/fg/active/hover`（暗底） | 仅侧栏使用，禁止页面内挪用 |

**使用规则**

- 禁止在组件 scoped 样式里写裸色值（hex/rgb/oklch 字面量）；一律 `var(--token)`，透明度场景用 `color-mix(in oklch, var(--token) 12%, transparent)` 过渡，成熟后收编为 `*-bg` 令牌。
- 功能色语义固定：success=可继续，warning=需关注但不阻塞，danger=不可逆/失败/离线，info=中性提示。同一状态全站只用对应功能色，不得跨义混用（如"迁移中"永远 warning，不用 info）。
- 侧栏暗色族与页面浅色族互不串用，维持"深导航浅内容"的专业感框架。

### 1.2 字体

| 项 | 规范 | 说明 |
| --- | --- | --- |
| 家族 | 现有 `--font-body`（-apple-system → Segoe UI → system-ui）与 `--font-mono`（JetBrains Mono → Menlo → monospace） | Win/Mac 双端系统栈已就绪，不引入 Web 字体（体积与加载收益为负） |
| 字号层级 | 22（页头 h1）/ 16（区块强调）/ **14（正文基准）** / 13（表格、表单、次要）/ 12（徽章、辅助）/ 11（大写表头、hint） | 与 style.css 现状一致，明文化；禁止 15/17 等野值 |
| 行高 | 标题 1.3；正文与表格 1.5；表单控件行高=控件高 | PageHeader 现状即 1.3/1.5 |
| 字重 | 400 正文 / 500 强调与徽章 / 600 标题与当前项 / 700 仅页头 h1 | 禁止 3 档以上混用 |
| 等宽场景 | 端口、IP、路径、版本号、日志、JSON | 一律 `--font-mono`；数字列建议 `font-variant-numeric: tabular-nums` |

### 1.3 间距系统（8px 基准，4px 半档）

| 令牌档 | 值 | 现有映射 |
| --- | --- | --- |
| xs | 4 | 图标与文字间隙、紧凑标签 |
| sm | 8 | 按钮组 gap、表格操作列 |
| md | 12 | 卡片内边距紧凑侧、表单项纵向距 |
| lg | 16 | 卡片内边距、flow 区块 gap |
| xl | 20 | `.app-content` 纵向 padding、页面级 gap |
| 2xl | 24 | `.app-content` 横向 padding、区块间 margin |

页面级骨架统一为：`根元素 { display:flex; flex-direction:column; gap:20px }`，区块间距一律走 gap，不写裸 margin。

### 1.4 圆角 / 阴影 / 边框 / 动效

| 项 | 规范 |
| --- | --- |
| 圆角 | `--radius-sm: 4px`（输入框、小按钮）/ `--radius-md: 6px`（下拉、气泡）/ `--radius-lg: 8px`（卡片、弹窗、抽屉）。禁止 pill（按钮高度固定的 999px）之外的野值 |
| 阴影 | 仅三档：`--shadow-sm`（卡片静态）/ `--shadow-md`（悬浮层：下拉、气泡）/ `--shadow-lg`（弹窗、抽屉、卡片 hover）。边框承担主分隔职责，阴影只做层级暗示，禁止彩色阴影 |
| 边框 | 常规 1px `--border`；强调 2px `--accent`（顶栏底线、品牌表头底线、选中项左条）——"1px 常规 + 2px 强调"两档制 |
| 动效 | 时长 0.15s（按钮/输入）/ 0.2s（色彩与透明度）/ 0.25s（卡片位移动效）；缓动统一 `ease`；禁用 >300ms 的装饰动画；列表不做逐项入场动画（数据页要快） |

---

## 2. 布局与组件规范

### 2.1 布局框架与分辨率

```
┌──────────┬────────────────────────────────────────────┐
│ AppSidebar │ app-header 56px（面包屑 + 用户区，sticky）        │
│ 240px     ├────────────────────────────────────────────┤
│ 可收起64px │ app-content（padding: 20px 24px，bg 页面底）      │
│          │   页面根：flex column + gap 20px               │
└──────────┴────────────────────────────────────────────┘
```

| 断点 | 策略 |
| --- | --- |
| 1920×1080（主力） | 内容区最大宽度不设限；四列统计卡（StatCard grid `repeat(4, 1fr)`）；表格全列展开 |
| 1366×768（最低保障） | 统计卡降两列（`repeat(auto-fit, minmax(240px, 1fr))`）；次要列进 `ColumnConfigPopover` 由用户自关；弹窗宽度≤960 |
| <1280 | 侧栏自动收起（`useSidebarResponsive` 已实现，保持）；表格启用横向滚动，禁止挤压列宽导致省略号泛滥 |
| 高度<800 | 弹窗/抽屉内部滚动，弹窗整体不超高（`max-height: calc(100vh - 96px)`） |

**尺寸规则**：侧栏 `--sidebar-w: 240px` / 收起 64px；顶栏 56px（`--header-h`）；内容区左右 24、上 20、下 ≥20。

### 2.2 页面模板（三类页面一个骨架）

1. **列表页**：`PageHeader`（标题+描述+主操作）→ 筛选行 → `.card > .table-container`（B 派品牌表头）→ 分页器。参考：路由管理、节点管理。
2. **配置/管理页**：`PageHeader` → 若干 `.card` 纵排（gap 20），卡片头 h3 14px/600 + 卡片头右侧动作区。参考：数据库管理、ClickHouse 配置。
3. **向导/复杂表单**：`PageHeader` → 步骤条 → 分区表单卡。参考：四层代理向导。

**留白裁定（消灭两派）**：新页面根元素**只写 flex+gap，不写 padding**（对齐数据库管理页样式，即 #99 的 A 派）；存量双倍留白页面（nodes/routes/upstreams/clusters/ssl/stream-proxies/global-rules/edge-autostart/node-tasks/edge-client/users/metrics/ansible-inventory）删除根元素 padding，按 #98 纪律**逐页**改、改一页截图对比一页。

### 2.3 核心组件规范

**按钮**（style.css `.btn` 族为准）

| 型 | 样式 | 状态 |
| --- | --- | --- |
| primary | `--accent` 底白字 | hover `--accent-hover`；active `--accent-active`；disabled 40% 透明 |
| secondary | `--surface` 底 + 1px `--border` | hover 边框与文字转 accent |
| ghost | 透明底 accent 文字 | hover `--accent-bg` 底 |
| danger | `--danger` 底白字 | 仅不可逆操作；danger-outline 用于行内删除 |
| 尺寸 | 默认高 32 / `.btn-sm` 28（表格行内一律 sm）/ `.btn-lg` 40（弹窗主操作） | |
| 规则 | 一个视图区一个 primary；行内操作 ≤4 个，超出收进「更多」下拉 | |

**表格**（`.table-container` 统一契约）

- 表头：B 派为标准——`--accent-bg` 底、11px 大写 600、`2px var(--accent)` 底线；表体 13px、行分隔线**有**（1px `--border`）、行 hover `--bg`。
- 状态列一律 `BadgeStatus`/`PublishStatusTag`，不写裸色文字；时间列走 `utils/format.ts`（#26），数字列右对齐 + tabular-nums。
- 行内操作按钮 `.btn-sm`；空态用 a-empty + 引导动作；加载态骨架屏（表格区 min-height 200px 防跳动）。
- 批量选择：表头 checkbox + 选中后表格上方浮出批量操作条（`--accent-bg` 底，含「已选 N 项」与清空）。

**表单**

- 结构 `.form-group`（label 12px/500 + 控件）+ 纵向 gap 12；必填 `*` 用 `--danger`（现状 `.form-label .required`）。
- 控件高 32，聚焦 1px accent 边框 + `0 0 0 2px var(--accent-bg)` 外圈；错误态 danger 边框 + `.form-error` 12px；帮助文案 `.form-hint` 11px muted。
- 弹窗内表单两列布局用 `.form-row`（≥576px 才两列）。

**弹窗（三层制，约定 #25，明文保留）**

| 层 | 组件 | 用途 |
| --- | --- | --- |
| 普通确认/信息 | `useOverlayModal` | 删除确认、轻提示——全站禁用 Modal.confirm |
| 共享流程弹窗 | `AppModal` + `useClusterUtils` 五弹窗 | 发布/删除进度等跨页复用流程 |
| 视图级内联 | 手写 modal-overlay | 页面特有弹窗（连接编辑、清理历史等） |

尺寸：sm 480 / md 640 / lg 960（`max-width: min(92vw, …)`）；头部标题 16/600 + 右上 ×；底部按钮右对齐，主按钮在右；危险主操作用 danger 底。Vue 属性内禁多语句（prettier 会重排破坏编译，#25 教训）。

**抽屉**：查看详情/日志类右侧抽屉，宽 640–760；迁移详情抽屉（760）为范式——描述区 + 分组表格（内部滚动）+ 底部指引。

**筛选器**：与表格同卡片顶部一行，gap 8；控件高 32；「查询」primary-sm、「重置」secondary-sm；筛选项变化即触发的（下拉/开关）不放按钮。

**分页器**：右对齐；`show-size-changer`（10/20/50）+ `show-quick-jumper`（条目 >50 时）+ `show-total`（「共 N 条记录」）；后端单页上限场景显示「仅显示最近 N 条」提示（数据库管理历史为范式）。

---

## 3. 交互与体验优化

### 3.1 操作反馈矩阵

| 场景 | 形式 | 规范 |
| --- | --- | --- |
| 请求中 | 行内：按钮 loading 态自旋 + 禁用；页面级：内容区骨架屏 | 禁止全屏遮罩 loading（除登录） |
| 成功 | `message.success`（右上，3s） | 文案带结果数量（如「已删除 3 条」） |
| 失败 | `message.error`，优先展示后端 `detail` | 已有 `errDetail()` 模式收编为通用工具 |
| 危险确认 | `useOverlayModal` 确认弹窗 | 涉及清库/删连接等写明后果与影响范围 |
| 长任务（>5s） | 进度弹窗/进度条（发布、迁移、批量执行） | 必须可中止或明确告知"后台继续"语义 |
| 后台任务状态 | 页内轮询 + 状态横幅（warning） | 数据库迁移横幅为范式：方向 + 开始时间 + 5s 轮询 |
| 表单校验失败 | 字段级 error + 首个错误字段聚焦 | 不用 toast 报字段错 |

### 3.2 导航层级

现状 5 个一级分组（核心功能/边缘网络/综合/系统管理/运维管理）+ 二级页面，最深 2 层，**满足 ≤3 层**约束。规则：

- 新功能先归入现有 5 组；出现第 3 层需求时优先用页面内 Tab 而非加菜单层。
- 面包屑保持「分组 / 页面」两级（DefaultLayout 现状）；页面内 Tab 切换不进面包屑。
- 权限不可见菜单直接隐藏（对齐 `database_management` 等开关模式），不置灰。

### 3.3 效率增强（按优先级）

1. **概览页工作台化**（Dashboard 改造）：按角色重排——首行 StatCard（集群/节点/在线率/今日任务）→ 节点健康卡（NodeHealthCard）→ 待处理告警与进行中任务列表；所有卡片可点击直达对应页面。
2. **全局搜索（P1）**：顶栏加搜索入口（Ctrl+K），先做「菜单/页面跳转」索引（静态路由表即可实现，成本低收益高），二期扩到集群/路由/节点名（需后端聚合端点）。
3. **快捷入口**：各列表页 PageHeader 右侧固定「+ 新建」主操作；高频审计场景（节点任务、发布）完成后在成功反馈里附「查看详情」跳转。
4. **操作回溯**：审计日志页（已有）+ 关键弹窗内显示「最近一次操作时间/人」（增量，按资源做）。

---

## 4. 落地执行建议

### 4.1 组件库选型

**保持 Ant Design Vue 4 单组件库**，不引入 TDesign/Element 第二库（双库样式互斥是风格漂移的最大来源）。分工边界：

- AntD 承担：Table（复杂交互）、DatePicker、Drawer、Progress、Empty、Dropdown、ConfigProvider 本地化；
- 自研原子层（style.css）承担：btn/card/form/badge 等轻量元素——这是页面"自研质感"的来源，已成型，保留；
- 原则：同一元素只允许一套实现，页面内禁止混用 AntD 按钮与 `.btn`（列表页操作列用 `.btn-sm`，弹窗底部用 AntD 按钮的现状保留并写入规范）。

### 4.2 令牌管理机制

1. `theme.css` 是唯一令牌源，`tokens.test.ts` 是守卫——新增令牌必须同步补测试断言。
2. 新增 ESLint 规则（`no-restricted-syntax` 或 stylelint `declaration-property-value-allowed-list`）拦截 scoped 样式中的裸色值字面量，新代码零容忍，存量随两派清理渐进消化。
3. `--p-*` 遗留别名冻结：不再新增，逐步用新令牌替换后删除（删除前全仓 grep 确认引用为 0，按 #46 的"前缀匹配"口径核对）。
4. CSS 重复治理遵循 #98：jscpd 只出候选，**逐对同源组件**合并，每对必须前后截图对比（1280 与 1920 两档视口），禁止批量执行。

### 4.3 分期实施

| 期 | 内容 | 验收物 |
| --- | --- | --- |
| P0 规范落地（本周） | 本文档评审定稿；theme.css 增补 8 个新令牌 + tokens.test.ts 同步；页面模板三类写进 AGENTS.md 一行规则+指针 | 令牌测试通过；AGENTS.md 更新 |
| P1 两派收敛 | ✅ 已完成：留白统一（19 页 288→264）、`--p-*` 别名清零（147 处迁回正源并删除别名块）、15px 野值清零（24 处→14px）。⏳ 待续（按 #98 逐对治理）：9–10px 微字 61 处、视图内颜色字面量收敛；jscpd 基线（2026-09-17 全仓）：css 147 块 / 2335 行（5.12%） | 前后截图对比 `/tmp/opencode/ui-effect/`（临时，不入库） |
| P2 组件与效率 | ✅ 已完成：全局搜索 Ctrl+K（`router/navMeta.ts` 索引 + `GlobalSearch.vue` 命令面板，7 项单测 + Playwright 链路实测；菜单命名与面包屑同源化）；**Dashboard 工作台化**（概览页重排：4 张运维统计卡 auto-fit 等宽 → 集群状态 + 节点在线卡（离线节点明细/全在线绿条）→ 最近路由 → 快捷入口/更多资源链接卡；数据全复用现有端点，零后端改动）。⏳ 待续：批量操作条、筛选器规范推广到 Top5 高频列表页 | 走查清单全绿 |
| P3 深色模式 | ~~见第 7 节~~ **已裁决不做**（2026-09-17 用户决策：无夜间深色模式需求，第 7 节规范仅留档） | — |

### 4.4 设计走查验收清单（每页合并前过一遍）

- [ ] 根元素无 padding，仅 flex+gap 20；页面符合三类模板之一
- [ ] 无裸色值/野值字号（15/17/px 以下整数除外）；令牌引用可 grep
- [ ] 表格用 `.table-container`，状态列用 BadgeStatus 族，时间列走 format.ts
- [ ] 弹窗归位三层制；危险操作有确认且文案写明后果
- [ ] 按钮层级正确（每视图一个 primary；行内 ≤4）
- [ ] 1366 宽度下无横向溢出（弹窗除外，允许表格横滚）；加载/空态/错误三态齐全
- [ ] 中文文案无翻译腔；图标语义与颜色符合 1.1 功能色映射

---

## 5. 运维场景专属组件

### 5.1 状态指示灯（规范化 `BadgeStatus`）

四态映射全站唯一：

| 状态 | 色令牌 | 语义 | 典型场景 |
| --- | --- | --- | --- |
| online | `--success` | 正常运行 | 节点在线、服务健康、发布成功 |
| warning | `--warning` | 异常但可服务 | 证书 30 天内到期、迁移进行中、部分节点失败 |
| offline | `--danger` | 不可用 | 节点离线、连接失败、任务失败 |
| info | `--info` | 未知/中间态 | 探测中、已停用 |

样式固定：7px 圆点 + 6px 同色 50% 光晕（现有实现）+ 12px 文字。规则：**点与文字同色**；表格内用紧凑档（无光晕）；状态必须可解释——hover tooltip 展示判定来源（如"最后心跳 12s 前"）。

### 5.2 资源占用进度条

```
< 70%   --success      正常
70–90%  --warning      关注（条色不变红，仅文字/图标提示）
> 90%   --danger       告警
未知     --border 灰条 + 「--」
```

- 用 AntD `a-progress`（line, size small, `strokeColor` 按上表）；宽度固定 120–160px + 右侧百分比等宽数字。
- 展示 CPU/内存/磁盘一律"条 + 数值"，禁止只给百分比文字；多核不拆分，只给均值 + tooltip。
- 场景接入：节点列表列内、NodeHealthCard、Dashboard 工作台。

### 5.3 告警提示卡片

结构 = `.card` 变体：左侧 4px 状态色条（warning/danger）+ 标题行（图标 + 告警名 + BadgeStatus）+ 描述（对象、时间、建议动作）+ 右侧动作按钮（「处理」primary-sm /「忽略」ghost-sm）。

- 密度：告警卡片高度 ≤72px，一屏可见 ≥5 条；同源告警聚合计数（"×3"）不刷屏。
- 无告警时显示 info 级"全部正常"细条（高 40px），不占版面。
- 排序：danger > warning，同级别按时间倒序。

### 5.4 批量操作与任务进度

- 批量操作条：勾选后表格上方浮出（`--accent-bg` 底、高 44px），含「已选 N」「清空」+ 批量动作按钮；动作一律走 `BatchActionProgressModal`（已有）显示逐节点结果，禁止静默批量。
- 部分失败语义：成功 N / 失败 M 分色统计（success/danger），失败项可展开看原因并可单独重试（对齐节点任务中心）。
- 长任务遵循"横幅 + 轮询"范式（数据库迁移为参考实现）：断开不终止、状态可恢复、锁语义明确提示。

### 5.5 日志与终端类展示

- 日志查看器（NodeTaskLogViewer）与 Monaco：底色固定深色终端底 `oklch(18% 0.015 250)`（与侧栏同族，两主题一致），文字 `oklch(85% 0.01 250)`，错误行 `--danger`。
- 等宽字体一律 `--font-mono` 12px / 1.6 行高；时间戳列右对齐 tabular-nums；支持关键字高亮与自动滚动开关。

---

## 6. 专业感与易用性平衡

**设计红线（沉稳专业）**：无渐变按钮、无大圆角卡片（>8px）、无插画式空态（用 a-empty 素雅态）、无彩色阴影、单页主色出现面积 ≤10%（按钮/选中/强调线）；装饰性动画一律不加。

**认知成本控制**：

- 高频操作 ≤2 步可达（列表页顶部新建、行内编辑）；
- 不可逆操作固定文案模板：「该操作将 <后果>，且不可撤销」+ 输入对象名二次确认（仅清库级）；
- 每个管理页的回答三问放第一位：现在什么状态（状态列/StatCard）→ 刚发生了什么（审计/任务）→ 下一步做什么（PageHeader 主操作）；
- 术语表全站统一（发布/回滚/边缘/清单），新页面命名先查 `DefaultLayout.pageNameMap`。

---

## 7. 深色模式与多环境适配

### 7.1 方案（OKLCH 令牌体系下成本低，单独立项 P3）

1. **挂载方式**：`<html data-theme="dark">`；themeStore 扩展 `mode: 'light' | 'dark'`（localStorage 持久化，跟随系统为默认值）。
2. **令牌翻面**：在 theme.css 增 `:root[data-theme='dark']` 块，仅覆盖色彩族令牌（bg/surface/fg/muted/border/侧栏族/`*-bg`），字体/间距/圆角/阴影结构不动。阴影透明度加深一档（6%→20%）。
3. **AntD 适配**：`ConfigProvider :theme="{ algorithm: theme.darkAlgorithm }"` 跟随 mode；zhCN 本地化不变。
4. **图表适配**：ECharts 颜色从当前硬编码改为读取 `getComputedStyle` 令牌（封装 `chartTokens()` 工具），主题切换时 setOption 重刷。
5. **自研原子层**：`.btn/.card/.table` 全部走令牌，理论零改动；走查时重点核 `color-mix` 透明度场景与侧栏/内容对比关系反转（深色下侧栏可略浅于页面底）。

### 7.2 可读性硬指标（两主题同验）

- 正文文字对比度 ≥ 4.5:1（WCAG AA）；大字号（≥18px bold）≥ 3:1；
- 状态色在两主题下分别校验（OKLCH 微调 L 值即可，色相不动）；
- 禁止纯黑背景 `#000` 与纯白文字（深色底用 `oklch(14–16% 0.01 250)`，文字 90–92% L）。

### 7.3 多分辨率与光线环境

- 1366 最低保障策略见 2.1；表格列全部可关（ColumnConfigPopover）即天然适配窄屏；
- 强光环境（机房/白天）：浅色主题为默认；暗环境：深色主题降低整体亮度负担——深色模式下页面底与卡片面明度差 ≤8%（避免"悬浮发光"感）；
- 打印/导出场景不做专项适配（手册截图走浅色主题固定视口，见截图产线）。

---

## 附：本次新增令牌清单（可直接合入 theme.css，同步 tokens.test.ts）

```css
--accent-hover: oklch(50% 0.16 210);
--accent-active: oklch(45% 0.15 210);
--accent-bg: oklch(56% 0.16 210 / 10%);
--success-bg: oklch(55% 0.15 145 / 12%);
--warning-bg: oklch(65% 0.15 85 / 12%);
--danger-bg: oklch(55% 0.18 28 / 10%);
--space-sm: 8px;  --space-md: 12px;  --space-lg: 16px;
--space-xl: 20px; --space-2xl: 24px;
```
