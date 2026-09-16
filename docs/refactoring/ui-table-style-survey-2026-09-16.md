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
| **C 未定制**（AntDV 默认） | 2 | **14px / 无大写 / 默认 `rgb(250,250,250)`** | 无 |
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
| 自启动管理 | `/edge-autostart` | **C** | 无 | toolbar | nowrap | **14px/无/—** | **`rgb(250,250,250)`** | 12-8 | ✗ | **14px** | 无 |
| Ansible 清单 | `/ansible-inventory` | **C** | 无 | card-title-row | **wrap** | **14px/无/—** | `rgb(250,250,250)` | 12-8 | ✗ | **14px** | 无 |
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

1. **筛选条命名分裂（6 种）**：`*-filter-bar`（A 派 6 页）、`toolbar`、`card-title-row`、`edge-filter-bar`、`sp-header-actions`/`pc-header-actions`（四层代理/插件组，属卡片列表非表格页）、无（B 派 3 页）。命名不统一使"全局调整筛选条"无法一次生效。
2. **A 派 `th` 的 `padding: 10px 16px` 实际不生效**：被 AntDV `size="middle"` 的 12-8 覆盖（6 页一致，因此无视觉差异）；只有未设 `middle` 的边缘客户端取到了 10-16 —— 属既有无常行为，不是本次引入。
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
