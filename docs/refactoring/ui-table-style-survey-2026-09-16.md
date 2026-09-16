# 列表页表格样式摸底（2026-09-16）

> 方法：Playwright 实测**运行期计算样式**（而非读源码），登录后逐页导航并采集首个 `th`/`td` 的
> `font-size / text-transform / letter-spacing / background / padding / white-space / border-bottom`，
> 同时记录表格外壳类名、筛选条类名与 `flex-wrap`。探针脚本为临时文件（未入库），可按本文件末节重建。
>
> 范围：所有渲染表格的页面（`<a-table>` 14 个视图 + `TableCard` 等 3 个组件 + 集群 Tab 子组件）。

---

## 0. 结论：全站存在 **3 个派系**（另有 1 个近亲变体）

| 派系 | 页面数 | 表头外观 | 外壳 |
|---|---|---|---|
| **A 中性表头**（多数派） | 6 | 11px / 大写 / 字距 .55px / 背景 `oklch(97% 0.005 250)` / nowrap / 12-8 内边距 | `.table-container` |
| **B 品牌色表头** | 3 | 11px / 大写 / 字距 .33px / 背景 `oklch(56% 0.16 210 / 10%)`（accent 10%）/ 不 nowrap / 8-14 内边距 | 无统一外壳（仪表盘用 `.table-card`） |
| **C 未定制**（AntDV 默认） | 2 → **0** | 14px / 无大写 / 默认 `rgb(250,250,250)` | 无 ✅ 2026-09-16 已并入 A 派（见 §6） |
| A 的近亲变体 | 1 | 同 A 的表头，但内边距 10-16、td 有下边框、筛选条会换行 | `.table-container` |

---

## 1. 实测矩阵（2026-09-16，admin，视口 1600×1000）

| 页面 | 路由 | 派系 | 外壳 | 筛选条类名 | 筛选条 wrap | th 字号/大小写/字距 | th 背景 | th 内边距 | th nowrap | 行字号 | 行下边框 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 审计日志 | `/audit-log` | A | table-container | audit-filter-bar | nowrap | 11px/大写/.55 | `oklch(.97 .005 250)` | 12-8 | ✓ | 13px | 无 |
| 上游管理 | `/upstreams` | A | table-container | upstream-filter-bar | nowrap | 11px/大写/.55 | 同上 | 12-8 | ✓ | 13px | 无 |
| 路由管理 | `/routes` | A | table-container | route-filter-bar | nowrap | 11px/大写/.55 | 同上 | 12-8 | ✓ | 13px | 无 |
| 节点管理 | `/nodes` | A | table-container | node-filter-bar | nowrap | 11px/大写/.55 | 同上 | 12-8 | ✓ | 13px | 无（内边距 12-16） |
| 用户管理 | `/users` | A | table-container | user-filter-bar | nowrap | 11px/大写/.55 | 同上 | 12-8 | ✓ | 13px | 无 |
| 节点任务 | `/node-tasks` | A | table-container | node-filter-bar | nowrap | 11px/大写/.55 | 同上 | 12-8 | ✓ | 13px | 无（内边距 12-16） |
| 数据库管理 | `/database-management` | **B** | 无 | 无 | — | 11px/大写/**.33** | **accent 10%** | 8-14 | ✗ | 13px | **1px** |
| ClickHouse 配置 | `/clickhouse-config` | **B** | 无 | 无 | — | 11px/大写/.33 | accent 10% | 8-14 | ✗ | 13px | 1px |
| 仪表盘 | `/` | **B** | table-card | 无 | — | 11px/大写/.33 | accent 10% | 8-14 | ✗ | 13px | 1px |
| 自启动管理 | `/edge-autostart` | **C → A ✅** | 无 | toolbar | nowrap | 11px/大写/.55 | `oklch(.97 .005 250)` | 12-8 | ✗ | 13px | 无 |
| Ansible 清单 | `/ansible-inventory` | **C → A ✅** | 无 | card-title-row¹ | **wrap** | 11px/大写/.55 | `oklch(.97 .005 250)` | 12-8 | ✗ | 13px | 无 |
| 边缘客户端 | `/edge-client` | A 变体 | table-container | edge-filter-bar | **wrap** | 11px/大写/.55 | `oklch(.97 .005 250)` | **10-16** | ✓ | 13px | **1px** |
| Edge 数据导入 | `/edge-import` | 未取到 | — | — | — | 表格位于折叠区（`v-if="showConflicts"`），探针未展开 | | | | | |
| 集群统管 | `/central-management` | 未取到 | — | — | — | 表格需先选集群卡片的 Tab（nodes/upstreams/routes/…） | | | | | |

> 审计日志一行是 **2026-09-16 对齐后**的结果（对齐前与「自启动管理/Ansible 清单」同款：14px/无大写/默认底色/行 14px）。

## 2. 静态核对：条件渲染与组件级表格

| 文件 | 表头样式 | 归属推断 |
|---|---|---|
| `components/TableCard.vue` | 有（accent 10% + 大写） | **B 派**（仪表盘实测印证） |
| `views/EdgeImport.vue` | 有（accent 10% + 2px accent 下边框） | **B 派**（表格条件渲染，实测未覆盖） |
| `views/CentralList.vue` | 有（`--p-color-primary-bg` + 2px 主色下边框） | **B 派变体**（用 CSS 变量而非硬编码 accent） |
| `views/clusters/ClusterRoutes.vue` | **无** thead 规则 | 由宿主 CentralList 决定外观 |
| `views/clusters/ClusterNodes.vue` / `ClusterUpstreams.vue` | **无** thead 规则 | 同上 |
| `components/NodeHealthCard.vue` / `RouteStatsCard.vue` | **无** thead 规则 | AntDV 默认 |

## 3. 连带发现

1. **筛选条命名分裂（多种）**：`*-filter-bar`（A 派 6 页）、`toolbar`（自启动管理）、`edge-filter-bar`（边缘客户端）、`sp-header-actions`/`pc-header-actions`（四层代理/插件组，属卡片列表非表格页）、无（B 派 3 页）。命名不统一使"全局调整筛选条"无法一次生效。
   - ¹ 修正：本表最初把 Ansible 清单的 `card-title-row` 记为筛选条，实际它是**卡片标题行**（标题 + 副标题 + 批量导入按钮），`flex-wrap: wrap` 对标题行是合理的，不构成样式分裂；该项已从"命名分裂"中剔除。
2. **A 派 `th` 的 `padding: 10px 16px` 实际不生效**：被 AntDV `size="middle"` 的 12-8 覆盖（6 页一致，因此无视觉差异）；只有未设 `middle` 的边缘客户端取到了 10-16 —— 属既有无常行为，不是本次引入。
   - **同类层叠现象（本次新发现）**：`td` 的 `padding`/`border-bottom` 在不同页面归属不同 —— A 派内部实测存在两种变体：**12-8 + 无行分隔线**（审计/上游/路由/用户）与 **12-16 + 无分隔线**（节点管理/节点任务），边缘客户端为 **12-16 + 有分隔线**。原因是 AntDV CSS-in-JS 注入与 `<style scoped>` 的层叠顺序逐页不同。**实践结论：给新页面写样式时应写"目标实际渲染值"，而不是照抄 A 派 CSS 里写的 10-16/12-16+1px** —— 后者可能被 AntDV 覆盖，写实际值则无论层叠顺序如何都得到同一结果（本次 Ansible 清单即按此法对齐）。
3. **`oklch(56% 0.16 210 / 10%)` 在 38 个文件出现**，但多数用于标签/徽章而非表头 → **不能靠 grep 判定派系**，必须实测（本文件的实测矩阵即为此）。

## 4. 统一建议（待决策）

| 方案 | 动作 | 风险 |
|---|---|---|
| **① 全站统一到 A**（中性表头） | 改 C 派 2 页 + B 派 3 页 + 边缘客户端微调；A 派 6 页不动 | 中：B 派的品牌色表头若是有意设计，会被抹平（需产品确认） |
| **② 分批迁移（推荐）** | 先改 **C 派 2 页**（现状等同 AntDV 默认，无设计意图，改法与审计页一致、风险最低）；B 派 3 页保留品牌色，作为"配置类页面"的既定风格 | 低 |
| **③ 保留现状** | 仅登记本文件 | 无 |

**若选 ②，落地顺序建议**：自启动管理 → Ansible 清单（两页均为"加表头/行样式"，无逻辑改动）→ 再评估 B 派是否要并派。

## 5. 复现方式

探针为一次性脚本（未入库），要点：登录 `admin/panshi123` → 逐路由导航 → `waitForSelector('table th')` →
读取首个 `th`/`td` 的 `getComputedStyle` 与外壳/筛选条类名。条件渲染页面（EdgeImport、CentralList）需先展开折叠区或选中集群 Tab。

另外可用 `frontend/scripts/manual-screenshots.mjs`（现行手册截图产线）产出整页截图做人工比对。

---

## 6. 执行记录（2026-09-16，按方案②先统一 C 派 2 页）

| 页面 | 改动 | 验证结果 |
|---|---|---|
| 自启动管理 `EdgeAutostart.vue` | `<a-table>` 加 `class="autostart-table"`；新增表头/行样式（A 派值） | 与上游管理基准**逐字段完全一致 ✓** |
| Ansible 清单 `AnsibleInventory.vue` | `<a-table>` 加 `class="inventory-table"`；新增表头/行样式；展开行用 `:not(.ant-table-expanded-row)` 排除 `nowrap` 以保护高级字段网格 | 表头一致 ✓；`td` 初版照抄 A 派**源码值**（12-16 + 1px 边框）实测与基准不符 → 改为"**实际渲染值**"（12-8 + 无边框）后**完全一致 ✓** |

**验证方式**：Playwright 采集 `/upstreams`（基准）与两个改动页的 `th`/`td` 计算样式，逐字段比对（非目测）。

**回归**：`vue-tsc -b` 通过；全量 844 项（8 个 `renders page header` 类并行抖动，隔离复跑 **76/76 通过**）；`npm run build` ✓。两页无单测（CSS/类名改动，无逻辑变更）。

**已知未覆盖**：Ansible 清单的**展开行**样式——当前数据无高级字段（可展开行数 0），其 `nowrap` 排除规则未能运行时验证，仅由选择器静态保证；有待有数据的清单时补验。

**后续可选**：B 派 3 页（数据库管理 / ClickHouse 配置 / 仪表盘）的品牌色表头是否并派，需产品确认；若并派，建议**同时把这段表头/行样式抽到共享位置**——目前它已被复制 **8 份**（静态分析记录的 CSS 重复率 10.21% 与此直接相关）。

### 6.1 第二轮（同日）：补上"外壳"差异，并把样式收敛为单一全局定义

**用户反馈**：两页虽标记为"已并入 A 派"，但**仍有可见差异**。复测证实——首轮只对齐了 `th`/`td` 计算样式，漏了**表格外壳**：

| 项 | A 派（上游管理） | 两页原状（`.card`） |
|---|---|---|
| 外壳类名 | `.table-container` | `.card`（页面本地覆盖） |
| 圆角 | `--radius-lg` = **8px** | `--radius-md` = **6px** |
| 溢出 | **`overflow: hidden`**（表头四角被裁剪到外壳圆角） | `overflow: visible` |
| 表格本体 | 透明（`background: transparent`） | 自带白底 + 自带 8px 圆角 → **双层圆角** |

**改法（净减少重复）**：

1. 在 `src/style.css` **新增一节 Table Shell**，把 `.table-container` 外壳 + 表头 + 行样式**只定义一次**（内边距取实际渲染值 `12px 8px`；行样式含 `:not(.ant-table-expanded-row)` 排除，保证展开行不被 `nowrap` 挤压）。
2. 两页改为使用该外壳：`.toolbar`（自启动）/ 主机列表标题行（Ansible）移出卡片成为独立行，`<a-table>` 包进 `<div class="table-container">`；删除页面本地 `.card` 覆盖与首轮新增的 `.autostart-table`/`.inventory-table` 两份拷贝。

**验证（逐页计算样式差集，基准 = 上游管理）**：

| 页面 | 外壳 | 表头 | 行 |
|---|---|---|---|
| 自启动管理 | ✓ 一致 | ✓ | ✓ |
| Ansible 清单 | ✓ 一致 | ✓ | ✓ |
| 6 个既有 A 派页面（上游/审计/路由/节点/用户/节点任务） | — | **改动前后逐字段无变化 ✓** | — |
| 边缘客户端 | — | — | ⚠️ `white-space` 由 `normal` 变 `nowrap`（其本地规则未设该属性 → 被全局规则接管） |

**边缘客户端的影响评估**：实测 `scrollWidth == clientWidth`、无横向溢出，且该变化方向与 5/6 个 A 派页面一致（属一致性改善）。若需零变更，在其本地块加一行 `white-space: normal` 即可。

**回归**：`vue-tsc -b` 通过；全量 **844/844 通过**；`npm run build` ✓。
