# Design: page-header-actions-standard

## Context

页头动作区 = `PageHeader` 的 `#actions` 槽渲染出的 `.page-header-actions` 容器（`PageHeader.vue`：`display:flex; justify-content:space-between; align-items:center; gap:16px` 的外层 + 动作容器自身 gap）。它与工具条（`.l5-toolbar`）、状态行（`.l5-chiprow`）、批量条（`.l5-batchbar`）是四个不同的承载面：工具条放**列表操作**（搜索/筛选/刷新/列配置/分组收起），批量条放**选中后的动作**，页头只放**页面级动作**。

现状取样（2026-11-21，两侧实测）：

- 设计页（14 张带动作区）：`ca-certs`（查看安装指引 ◉ / 创建 CA 根证书 ◉）、`central`、`clusters`（备份下载 ◉ / 从备份导入 ◉ / 新建集群 ◉）、`dns-http`（批量管理 ○ / 新建 DNS 代理路由 ◉）、`dns-udp`、`global-rules`、`nodes`（批量导入 ◉ / 添加节点 ◉）、`overview`（刷新 ◉）、`plugin-groups`、`plugin-metadata`（添加插件元数据 ◉ / 插件开关 ○）、`plugin-switches`（操作日志 ◉）、`routes`、`server-certs`（添加已有证书 ○ / 生成证书 ◉ / 前往 CA 根证书下载 → ○）、`static-resources`、`stream-proxies`、`upstreams`（◉=带 13px 图标，○=纯文字）。
- 实现侧（22 个页面有 `#actions`）：仅 `NodeList` 的「批量导入」带 `StrokeIcon`；`CentralList`/`ClusterList` 已按 central-management-parity r1 补齐；其余纯文字，且存在 `+ `、`＋ `、无前缀三种写法与一处 inline `margin-left: 8px`。

## Goals / Non-Goals

- Goals：页头动作区**一套形态**（主次/图标/顺序/文案/布局）；设计页与实现**一一对应**；用守卫把规则钉住，避免下一轮 parity 反复报差。
- Non-Goals：不动工具条与批量条（各有既定规范）；不动行内动作（`.ops`/`.op-btn`、`.op-pub`）；不为页面新增功能入口（按钮集冲突一律走「裁决表」，本变更不创造能力）；不改页头标题/描述/统计徽标（属 mockup-parity-standard）。

## Decisions

### D1 · 承载范围

页头动作区 SHALL 只承载**页面级动作**，三类：

1. **创建类**（唯一主操作）：新建集群 / 添加节点 / 新建上游 / 添加插件组 …
2. **导入/导出类**：批量导入、备份下载、从备份导入
3. **页面级模式或跳转**：批量管理（进/出批量模式）、前往 CA 根证书下载、插件开关、查看安装指引

以下 SHALL NOT 进页头：行内动作（详情/编辑/删除/发布）、工具条动作（刷新/列配置/分组收起/搜索筛选）、批量选中后的动作（归 `.l5-batchbar`）、破坏性动作。

### D2 · 数量与主次

- 每页 1–3 颗；**恰好 1 颗 `.btn-primary` 且恒为最右一颗**；其余一律 `.btn-secondary`。
- 无主操作页面（如只有「操作日志」的插件开关页）可以只有 secondary。
- 破坏性/危险动作用色不进页头。

### D3 · 文案

- 结构「动词 + 名词」，≤ 8 个汉字，首字母大写语义不强求（中文）。
- **主操作按钮禁止 `+` / `＋` 前缀**——覆盖页头动作区、空态 CTA、页面级区块 CTA（如卡片内「新增位置」、集群 Tab「添加全局规则」）：页头加号由 `plus` 图标承担，空态/区块按钮则直接去掉加号。
- **例外（保留 `+`）**：表单内逐行/逐项「添加」类按钮（`.btn-ghost`/`a-button type=link`，如「+ 添加一行」「+ 添加目标」「+ 添加到上游节点」）——它们表达的是「再追加一条」，与图标化主按钮不同类，且通常没有图标位置。
- 不使用省略号、不使用「新建/添加」混用无意义交替（同一域内保持一致：集群域用「新建」，资源域沿用各自既有动词）。

### D4 · 图标

- 「创建/新建/添加」类 → `plus`；「导入」类 → `upload`；「下载/导出」类 → `download`；「刷新」→ `rotate`。
- **批量管理、跳转、查看类不加图标**（与设计页现状一致）：批量管理（5 张设计页均无图标）、插件开关、前往 CA 根证书下载 →、查看安装指引。
- 图标规格：13×13、`stroke-width: 2`、位于文字左侧，间距由 `.btn { gap: 6px }` 提供，不得自己加 margin。
- 图标单点 = `components/StrokeIcon.vue`（`viewBox 0 0 24 24`）。缺图标时按「无合适图标就不加」处理，禁止临时造形。

### D5 · 顺序

从左到右：**批量管理 → 导入/导出类 → 创建类（主操作最右）**。已对齐样例：节点管理「批量导入 | 添加节点」、四层代理「批量管理 | 新建四层代理」。

### D6 · 布局

- 间距只由容器提供（`.page-header-actions { display:flex; gap:8px; align-items:center }`，页面层 `PageHeader` 的外层 `gap:16px` 管标题与动作之间）。
- **禁止按钮 inline `margin-left/right`**（`ServerCertList.vue` 的 `style="margin-left: 8px"` 移除）。
- 按钮 `flex-shrink: 0`；标题列可缩，动作区不压缩。
- 尺寸：沿用 `.btn`（`padding 6px 14px`、`13px/500`、高 32）。

### D7 · 权限

无权限的动作**整颗不渲染**（`v-if`），不 disabled、不置灰——页头是入口，不是状态展示。

### D8 · 窄屏

页头保持单行：标题/描述列可缩，动作区不换行、不隐藏图标；≤ 1280 时允许动作区整体换到描述下方（`PageHeader` 现有 `flex-wrap` 行为），不做按钮文字收起（工具条的 `fold-all` 收敛规则不适用于页头）。若某页在此宽度下仍溢出，按页面单独处理并在此文档登记。

### D9 · 设计页与实现一致性

- 设计页 HTML 的 `<div class="page-header-actions">` SHALL 与本页实现的按钮集一一对应：数量、顺序、主次、文案、图标有无。
- **新增/退役按钮必须两侧同改**（#298 的推广）：实现加按钮 → 设计页补同形；设计页有按钮而实现已另置 → 二选一裁决后同步删除或回填。
- 守卫（`mockupParity.source.test.ts` 或新守卫文件）：
  1. 页面 `#actions` 内按钮文案不含 `+`/`＋` 前缀；
  2. 每页 `.btn-primary` 数量 ≤ 1 且位于动作区末尾；
  3. 页头按钮不得出现 inline `margin-left`/`margin-right`；
  4. 页头按钮若带图标，必须是 `StrokeIcon`（禁内联 `<svg>` 复制）。

## 逐页对照与裁决表（11 页 + 2 已对齐）

| 页面 | 设计页按钮（◉带图标） | 实现现状 | 处理 |
|---|---|---|---|
| 节点管理 | 批量导入 ◉ / 添加节点 ◉ | 批量导入 ◉ / `+ 添加节点` ○ | 去前缀 + 补 `plus` |
| 上游管理 | 新建上游 ◉ | `+ 新建上游` ○ | 去前缀 + 补 `plus` |
| 路由管理 | 新建路由 ◉ | `+ 新建路由` ○ | 去前缀 + 补 `plus` |
| 四层代理 | 批量管理 ○ / 新建四层代理 ◉ | 批量管理 ○ / `+ 新建四层代理` ○ | 去前缀 + 补 `plus` |
| DNS 代理 UDP | 批量管理 ○ / 新建 DNS 代理 ◉ | 同型 | 同上 |
| DNS 代理 HTTP | 批量管理 ○ / 新建 DNS 代理路由 ◉ | 同型 | 同上 |
| 插件组 | 批量管理 ○ / 添加插件组 ◉ | 同型 | 同上 |
| 全局规则 | 批量管理 ○ / 添加全局规则 ◉ | 同型 | 同上 |
| 静态资源 | 添加静态资源 ◉ | 批量管理 ○ / `+ 添加静态资源` ○ | 去前缀 + 补 `plus`；设计页回填「批量管理」 |
| 插件元数据 | 添加插件元数据 ◉ | 批量管理 ○ / `+ 添加插件元数据` ○ | 去前缀 + 补 `plus`；设计页回填「批量管理」（「插件开关」是设计页正文 alert 里的跳转，不在页头，另行记录） |
| CA 根证书 | 查看安装指引 ◉ / 创建 CA 根证书 ◉ | `＋ 创建 CA 根证书` ○（安装指引在页内折叠面板） | 去前缀 + 补 `plus`；「查看安装指引」见 E2 |
| 服务器证书 | 添加已有证书 ○ / 生成证书 ◉ | 生成证书 ○（带 inline margin） | 去 inline margin + 补 `plus`；「添加已有证书」见 E3 |
| 统一管理 / 集群管理 | 3 颗全带图标 | 已对齐（r1） | 无 |

### 待裁决（E）——已裁决 2026-11-21

> 说明：初版清单把两处**正文元素**误算成页头按钮（`plugin-metadata` 的「插件开关」实际在正文 alert 里，`server-certs` 的「前往 CA 根证书下载 →」实际在横幅里，实现同样在横幅）。按精确解析后的页头按钮集修正如下。

- **E1 · 插件元数据「插件开关」** → **不是页头按钮**，是设计页正文 alert 内的跳转链接，实现没有该链接（功能为独立页 `/plugin-switches`，侧边栏已有入口）。本变更不动它，仅登记为「正文级差异」待后续按需处理。
- **E2 · CA 证书「查看安装指引」** → **删设计页按钮**。实现是页内 `<details>` 折叠面板（四段安装步骤齐全），功能未缺；页头按钮属旧形态。
- **E3 · 服务器证书「添加已有证书」** → **删设计页按钮**。实现无此功能，经用户确认**不是需求**；页头只保留「生成证书」+ `plus` 图标。横幅里的「前往 CA 根证书下载 →」两版一致，不动。
- 另：`static-resources.html` 与 `plugin-metadata.html` 的页头补「批量管理」（实现已有该按钮，设计页缺，属 D9 的回填方向）。

### 第二批（2026-11-21，用户要求「并进同一个变更收掉」）

范围 = 上批未覆盖的两类：

1. **空态 / 页面级区块 CTA 的加号前缀**（本批已清）：`GlobalRuleList`（空态）、`StaticResourceList` / `DnsQueryList` / `PluginConfigList`（空态）、`clusters/ClusterStaticResources`、`clusters/ClusterGlobalRules`（Tab 区块）、`RelayGateways`（卡内新建 + 空态文案）、`ClickHouseConfig`（空态）、`DbBackupCard`（新增位置）、`PluginMetadata`（Tab 区块「添加」）。表单内逐行「添加」按钮保留 `+`（D3 例外）。
2. **无设计页的系统页面页头**（本批补齐 D3/D4）：`DatabaseManagement`、`ClickHouseConfig`、`RelayGateways`、`UserList`、`NodeTaskCenter` 的主操作去前缀并加 `plus`；`Dashboard` 的「刷新」补 `rotate` 图标（对齐 `overview.html`）。这些页面没有 `proposal-c` 设计页，所以只做「符合规范」而不做设计页对照。

同时把守卫扩到全站：`pageHeaderActions.source.test.ts` 现在扫描全部 `.vue`（含 `views/clusters/*` 与 `components/*`）——主操作按钮禁前缀；有 `#actions` 的页面校验「无 inline margin / 无内联 `<svg>` / primary ≤ 1」；设计稿覆盖的 14 页额外校验「primary 在最右」与「设计页按钮数一致」。

## Risks / Trade-offs

- 去掉 `+` 前缀后，按钮文本变短，测试中按 `+ 新建…` 断言的位置需要反转（#217 断言反转清单先行）；e2e 中 `button:has-text("新建集群")` 类定位不受影响（后缀匹配）。
- 批量管理 5 页的文案在「批量管理/退出批量管理」间切换，属既有行为，本规范不改语义。
- 「前往 CA 根证书下载 →」若按 D3 去箭头，会影响 `ServerCertList` 横幅同类按钮——本变更只规范页头，横幅另行处理（避免范围外改动）。
