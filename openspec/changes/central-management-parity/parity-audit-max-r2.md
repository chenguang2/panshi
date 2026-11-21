# 统一管理 · 最大化面板 parity 审计 r2（Tab 内容）

- 日期：2026-11-21
- 基线：`docs/ui/Live-Artifact-5/proposal-c/central.html` 状态二（`.max-panel`，7 个 `.dbody.tab-body`）
- 触发：用户点集群卡的节点/路由统计格进入最大化后，认为与设计页差距大
- 方法：同视口 1600×1000，设计页 `file://`（强制 `#viewMax` 可见）与实现页 `/central-management` 同时进入最大化，逐 Tab 截图 + 结构/样式取值。脚本与截图：`/tmp/opencode/parity-max/`（`audit-max.mjs` 结构、`probe-body.mjs` 样式、`design-<tab>.png` / `impl-<tab>.png`）。

## 一、面板外壳（r1 已对齐，本次复核无新差异）

mini-bar（--bg 底 + 上下双线 + 胶囊项 + × 收起）、名称行（16/700 + 标识 + 6 动作，高 28）、7 页签（13px 图标 + 2px accent 上边 + accent 淡底 + mono 计数胶囊）。仅剩数据差异（区域徽章有无、计数不同），不计缺陷。

## 二、Tab 内容（差距集中区：7 个 Tab 全部沿用旧版「集群 Tab」UI）

### P0-1 工具条形态（7 个 Tab）

- 设计：`.tab-toolbar` + `.tool-btn`（高 30、12px、浅底 + 1px 边、图标在前、按 `.divider` 分组、`spacer` 后右端「列配置」）。
- 实现：antd 按钮族——主操作是**实心 accent `.ant-btn-primary`**（高 24.8、12px/500），其余灰底小按钮，无分隔线、无分组。
- 实现多出设计没有的：nodes 的「刷新 / 搜索节点 / 全部▾」，routes/upstreams 的「搜索 / 全部▾」。

### P0-2 表格解剖（nodes / upstreams / routes）

| | 设计 `.l5-table` | 实现 a-table |
|---|---|---|
| 表头 | 11px/600、内距 9×12、`--bg` 灰底、无大写转换、列分隔靠右缘短线 | 11px/600、内距 8、accent 10% 底、**转全大写**（「EDGE版本」） |
| 单元格 | 13px、内距 10×12、行高 38–40、无竖线 | 13px、内距 0（外框单元格铺满）、行高更高 |
| 首列 | `#` 序号（`.c-idx` mono 12） | **勾选列**（checkbox），无序号列 |
| 列宽 | colgroup 固定（nodes 最小 1076） | 与设计列宽不一致，无固定最小宽 |

### P0-3 列集缺失（功能信息缺失）

- **集群节点**：设计有 8 列（# / IP / Edge版本 / 服务端口 / 管理端口 / **Edge安装路径** / 状态 / 操作）；实现只有 7 列，**缺 Edge安装路径**（表单里有 `edge_path`，表格没展示）。
- **路由**：设计有 8 列（# / 名称 / URI / **方法** / 优先级 / 发布状态 / **描述** / 操作）；实现缺 **方法** 与 **描述** 两列。
- **上游**：列集基本一致（名称/负载均衡/目标节点/描述/发布状态/操作），缺 `#`。

### P0-4 行内动作形态

- 设计：主行动 `发布` / `重载`（`.op-pub`：accent 描边 + 淡底 + 12px/500、高 24）+ 次要 ghost + `⋯` 三圆锚点（菜单三栏：CRUD → 危险 → 动作）。
- 实现：平铺 4–5 颗按钮（routes/upstreams：复制 / 编辑 / 删除 / 发布 / 版本管理；nodes：启动 / 停止 / 状态查询 / 更多▾），无主次层级。

### P0-5 分页条

- 设计：`.l5-pager`（左「共 N 个节点 / 条路由 / 个上游 · 每页 50 条」，右「‹ 页码 › · 跳至 n 页」，边框无）。
- 实现：antd 分页（「共 N 条 · ‹1› · 20 条/页」），尺寸/文案/单位均不同。

### P1-1 工具栏动作集偏差（routes / upstreams）

- 设计工具栏只有「添加 X + 列配置」；实现把批量/行内动作（复制/编辑/删除/发布/版本管理）堆进工具栏，与「行内动作 + ⋯ 菜单」的设计意图相反。

### P1-2 卡片 Tab（插件组 / 插件元数据 / 全局规则 / 静态资源）

- 设计卡脚：文字按钮「查看 / 编辑 / 删除 / 发布 / 版本管理」（发布用 `.op-pub` 强调）。
- 实现（插件组实测）：图标按钮 👁 / ✏️ / 🗑 + 「发布 / 版本管理」，缺「查看/编辑/删除」文字，图标语义弱。
- 设计卡头：名称 + 版本胶囊（`v2 · 11-14 20:05`）+ 差异胶囊；实现卡头显示**数字 ID**（如 `1750087897902784512`）——需确认是该条记录 `name` 为空的数据问题，还是标题回填缺兜底。
- 添加入口：设计 `.tool-btn`（浅底描边）；实现实心 accent primary。

### P1-3 状态列

- nodes 设计：`.pub-cell` 两枚胶囊（已启用 + 在线/离线）。
- 实现：单枚「未检测/已启用」+ 依赖 badge 组件，离线态没有独立表达。

### P2-1 空态

- 设计：卡片/表格型空态；实现：居中纯文字（如「暂无静态资源，点击"添加静态资源"创建」）。观感差异，功能无缺。

## 三、改进意见（分批，按风险排序）

### 批次 A · 外观对齐（低风险，不动业务逻辑，7 个 Tab）

1. 工具条 `.tool-btn` 化：添加按钮改浅底描边（不再实心 primary）、按钮加图标、插入 `.divider` 分组、右端固定「列配置」。
2. 表格解剖：把三张表外观覆盖到 `.l5-table` 口径（表头灰底/去大写/9×12 内距、行 10×12、去竖线、hover 4%），复用列表页已建立的 `.table-container.l5-card .ant-table-*` 覆盖模式（换成 `.max-panel .dbody` 作用域）。
3. 行内按钮统一 `.op-pub`（主行动）/`.op-btn`（次要）尺寸与配色。
4. 分页条换共享组件 `components/ListPager.vue`（单位按页：个节点 / 个上游 / 条路由）。
5. 卡片 Tab：卡脚按钮文字化（查看/编辑/删除/发布/版本管理），添加入口 tool-btn 化。

### 批次 B · 结构对齐（中风险，涉及列集与动作集）

6. 补列：nodes 加「Edge安装路径」；routes 加「方法」「描述」。
7. 行内动作收敛为「主行动 + ⋯ 菜单」：复制/编辑/删除/版本管理/差异进菜单（菜单三栏规则 #81），工具栏只留「添加 + 列配置」。
8. 工具栏去掉设计没有的「刷新 / 搜索 / 全部状态下拉」，或按裁决保留但降为右侧弱化控件。
9. 序号列：加 `#`（与勾选列并存的方案需裁决）。

### 批次 C · 可选

10. 空态卡片化；状态列拆「已启用 + 在线/离线」两枚胶囊。

## 四、待裁决

- **Q1 范围**：A+B 全做 / 先做 A / 先做 nodes+routes 的 A+B（其余后续）。
- **Q2 工具栏多余能力**：按设计删除「刷新/搜索/全部状态」/ 保留但右侧弱化 / 仅删工具栏里的复制/编辑/删除/发布/版本管理。
- **Q3 勾选列**：保留（批量需要）并另加 `#` 序号列 / 按设计只留 `#`（放弃 Tab 内批量选择）。

## 五、修复记录（2026-11-21，批次 A 全部落地）

| 审计项 | 结论 | 落点 |
|---|---|---|
| P0-1 工具条形态 | ✓ | `style.css` `.max-panel .dbody .node-actions .ant-btn`（30px/12px/400/浅底描边，含 primary）；StrokeIcon plus/play/pause/rotate/chevronDown |
| P0-2 表格解剖 | ✓ | 表头 `--bg` 灰底 + 去大写 + 9×12 + 11px/600 muted；单元格 10×12；行 hover 4%；表头竖线关闭；表头复选框行盒 19px |
| P0-3 列集缺失 | ✗ 未做（批次 B） | 节点缺「Edge安装路径」、路由缺「方法/描述」——本次裁决只做外观，列集变更留 B |
| P0-4 行内动作 | ✓ | 节点「重载(op-pub) + 状态(op-ghost) + ⋯」；上游/路由「发布(op-pub) + ⋯」；菜单三栏（CRUD → 删除(红+解释) → 版本管理）；列宽 actions 340→120/110 |
| P0-5 分页条 | ✓ | 三表 `:pagination="false"` + `ListPager`（个节点/个上游/条路由，页容量下拉 + 跳至） |
| P1-1 工具栏动作集 | ✓ | routes/upstreams 仅留「添加 X + 删除 N(勾选后可用) + 列配置(右端)」，重复动作移入行内 ⋯ |
| P1-2 卡片 Tab | ✓ | 卡脚文字按钮（查看/编辑/删除红/发布 op-pub/版本管理）+ 上缘分隔线；静态资源卡脚折行成组；添加入口浅底 30px |
| P1-3 状态列 | ✗ 未做（批次 C） | 节点仍为单枚运行态徽章 + 管理开关徽章（已满足「禁用/在线」表达），双胶囊形态留 C |
| P2-1 空态 | ✗ 未做（批次 C） | 仍为居中纯文字 |

补充落地（审计外）：
- 首列「勾选 + `#` 序号」并存（用户裁决），序号跨页连续、不进列配置。
- `RouteList` / `UpstreamList` 独立页 ⋯ 菜单顺序统一到 #81（复制/编辑 → 删除 → 版本管理），源码守卫防回退。
- 卡脚「添 加」antd 自动空格问题（`PluginMetadata` 卡内）已包 `<span>` 修掉；`ClusterRoutes` 死 import 清理。

验证：`clusters` 组件套 + `CentralList` + `mockupParity` + `pageHeaderActions` + 独立页两套 **619 例**绿；`vue-tsc -b` 干净；真机 1600/1280 两档截图（`/tmp/opencode/parity-max/fixer{2,3}-*.png`、`menu-*.png`）。

## 六、批次 B（补列）记录（2026-11-21）

用户裁决「只补列」，故 P0-3 落地、P1-3（状态双胶囊）与 P2-1（空态卡片）仍留批次 C。

- 集群节点：默认列新增「Edge安装路径」（宽 220，`ellipsis`——实测无省略时路径溢出压到「状态」列）。
- 路由：默认列新增「方法」（宽 110，`.m-tag` 胶囊，单行取前 2 枚、`title` 给全量方法；4 枚时折行会撑高行、加 `+N` 会挤压列宽，均已试过并弃用）与「描述」（宽 200，`ellipsis`）；默认列序 = 名称 / URI / 方法 / 优先级 / 发布状态 / 描述 / 操作，与设计一致。
- 名称 / URI / 描述同样补 `ellipsis`——真实数据里名称常是路径形态，省略后不再压列。
- 存量用户已保存的列配置仍优先（未勾选的列不会因默认值变化自动出现），符合 #79 口径。
- 验证：1600 视口两表 `scrollWidth == clientWidth == 1278`（无溢出）；截图 `coladd-nodes.png` / `coladd-routes.png`；`useClusterNodes/useClusterRoutes` + clusters 套 + NodeList/RouteList/CentralList/mockupParity 共 **470 例**绿；`vue-tsc -b` 干净。

## 七、批次 C · 空态规范（2026-11-21，P2-1 落地：面板 7 个 Tab）

**前提**：16 张设计页 grep `empty` 无命中——设计页刻意只画有数据态，故本次不是「还原设计稿」，而是**建立并落定一套空态规范**（口径写入 `docs/ui/Live-Artifact-5/README.md` 维护约定 #6）。

原语与实现：

- 解剖 = `docs/ui/Live-Artifact-5/proposal-c/theme.css:2345-2349` 的 `.empty5`：`flex column / align center / padding 44px 20px`，子元素 `.e-icon`（52px 虚线圆 + 居中图标，`margin-bottom 12px`，边框 `1px dashed oklch(50% 0.018 240 / 40%)`，底 `var(--bg)`）/ `.e-title`（13px 600 前景色）/ `.e-sub`（12px muted）/ `.e-actions`（flex gap 8）。
- 组件 = `components/EmptyState.vue`：props `title`（必填）/ `description?` / `icon?`（默认 `inbox`，转发 `StrokeIcon`）。**数值不重复声明**——`src/style.css` 的 `.empty5/.e-*` 是该原语唯一实现（独立页 `NodeList`/`UpstreamList`/`RouteList` 已在消费），组件只补组件级差异（占满空态容器 + 图标色 `var(--muted)`），避免样式双源（#78 口径）。
- 图标：`StrokeIcon` 新增 `inbox`（feather inbox 线稿），并把图标名联合类型提升为模块作用域导出 `StrokeIconName`，供 `EmptyState` 的 `icon` prop 复用类型（不走 `string` 透传、不用 `as any`）。
- 消费点（7 个 Tab，空态出现条件 `v-if` 一律不变）：
  | Tab | 形态 | 标题 | 说明 | 动作 |
  |---|---|---|---|---|
  | `ClusterNodes` | 表格 `#emptyText` | 暂无节点 | 添加节点后可执行安装、启停与状态查询 | 添加节点 |
  | `ClusterUpstreams` | 表格 `#emptyText` | 暂无上游 | 添加上游后，路由才能把流量转发到后端 | 添加上游 |
  | `ClusterRoutes` | 表格 `#emptyText` | 暂无路由 | 添加第一条路由，将流量按规则转发到上游 | 添加路由 |
  | `ClusterPluginConfigs` | 卡片 | 暂无插件组 | 插件组把一组插件打包，供路由/全局规则复用 | 添加插件组 |
  | `ClusterGlobalRules` | 卡片 | 暂无全局规则 | 全局规则对所有路由生效，可按条件改写请求/响应 | 添加全局规则 |
  | `ClusterStaticResources` | 卡片 | 暂无静态资源 | 上传 ZIP 后由 Edge 直接对外提供静态文件 | 添加静态资源 |
  | `PluginMetadata` | 卡片 ×2 | 未找到可配置的插件 / 暂无插件元数据 | 插件目录中的插件已全部配置，或被特性开关过滤 / 点击左侧可用插件卡片上的「添加」按钮开始配置 | 无（添加入口在左侧插件卡上） |
- 表格槽名是 `#emptyText`（#57 同族坑：不是 `#empty`）。`ClusterRoutes` 原「暂无路由 — 添加第一条路由…」旧块一并替换，无两套并存。
- 按钮沿用面板既有 `.ant-btn` 30px 浅底规则（`style.css` `.max-panel .dbody .node-actions .ant-btn` 同口径），无新增按钮样式。
- 独立列表页（`NodeList`/`UpstreamList`/`RouteList`/`PluginConfigList`/`PluginMetadataList`/`GlobalRuleList`/`StaticResourceList`/`CaCertList`/`ServerCertList`）**未动**，留待后续统一。
- 验证：`EmptyState.test.ts`（6 例：结构顺序 / 无 description 不出 `.e-sub` / 无插槽不出 `.e-actions` / 空白插槽不出 `.e-actions` / 图标默认与覆盖 / 图标 20px）；`ClusterGlobalRules.test.ts` 空态断言随形态更新（`.empty-hint button` → `.empty5 .e-actions button`，#217）；真机截图见 `/tmp/opencode/parity-max/empty-*.png`。
