# autostart-page-restyle 验收记录（2026-11-25）

基准：`docs/ui/Live-Artifact-5/proposal-c/edge-autostart.html`（用户已定稿）。视口 1600×1000。

## parity 量测

量测脚本：本目录 `as-impl.cjs`（静态对照）/ `as-impl2.cjs`（状态态补测）。

**零差异元素**（font-size/weight/color/bg/border/radius/height/padding 九维度）：
工具条分组下拉（104）/ 搜索框（150，经共享 SearchInput 组件）/ `.tool-btn`（重载+批量三钮）/ 状态 chips（默认态与激活态）/ 页头徽标 `.ph-lite.lite-accent` / 行内操作 `.as-op`（含 danger 变体）。

**结构核验**（真机数据）：chips 7 枚（空计数 chip `.empty` 降透明生效：未配置 0 / 查询失败 0）；状态胶囊 20 枚带色点（当前库内节点全为「未查询」态，灰实底正确）；集群列 20 个色点（同集群同色相）；「全部状态」下拉已不存在；零 console 错误、无横向溢出。

**说明**：pill 变体逐色对照受库内数据限制（当前全为未查询态），六态色值的实现 CSS 与设计页逐字同源（同 oklch 值转录）；待库内出现真实态后可用同脚本复测（`pill-variant` 段）。

## 截图

`design-page-top.png`（设计页主视图）/ `design-page-drawers.png`（设计页抽屉样张）/ `impl-page.png`（实现真机主视图，真实数据）。

## 二轮：nodes 全面对齐（2026-11-25 裁决 2+3+4，设计页重写为 nodes.html 同骨架）

**实现扩围**：grid-table 表格解剖 / 外置 ListPager（钉位保留）/ `.l5-batchbar` 批量条（语义不变：选中优先否则筛选全量，未选不禁用——与节点页 need-sel 禁用形态有意不同）/ 分组平铺双视图（`useListClusterGrouping` + `ClusterGroupRow`，分组默认）/ 列配置个性化（存储键 `edge_autostart`）/「重载」→「刷新」。

**真机核验**：分组视图（组头「测试DNStest · 17 节点 · 17 未查询」+ 勾选提示）、平铺视图（集群列色点回归、全部收起隐藏）、seg 切换、刷新文案（无「重载」）、批量条、ListPager（无 antd 内置分页）全部到位；零 console 错误。

**结构计数**：seg 2 枚 / batchbar ✓ / ListPager ✓ / antd 分页已消失 / grid-table ✓ / chips 7 / 胶囊 20 带色点。

## 测试与回归

- 守卫先行 RED→GREEN：`pageHeaderActions`（PAGES +1 对，徽标断言先红后绿）+ `mockupParity` autostart 段 3 条红线（禁「全部状态」回流 / 必含 l5-chiprow / 胶囊带色点 + cl-cell）
- 新增 `EdgeAutostartChips.test.ts` 3 例（七枚 chip 计数 / 点 chip 过滤行数=计数 / 全部复位）；既有 6 个 EdgeAutostart 测试文件全绿（`GroupFilter` 选择器随类名反转 2 处：`.toolbar select.form-input` → `.l5-toolbar select`；`.batch-query` 类名保留）
- `npx vue-tsc -b` 0 error
- 全量 `npx vitest run --maxWorkers=4`：3478 passed；2 例漂移失败（NodeList 刷新 / NodeFormModal 路径校验，均未改动文件），隔离复跑 86/86 全绿——按 AGENTS #58 定性 CPU 争抢型波动，非回归

## 行为等价性

- 状态 chips 点击写 `statusFilter`，过滤复用既有 `filteredNodes` 逻辑（「未查询」= `autostart_status === null` 精确匹配语义不变）
- chips 计数基于集群/IP 过滤后的同一数据源（不含状态过滤自身），口径与原下拉一致
- 批量按钮勾选联动计数、预检禁用 + 原生 title 原因提示、重载 tooltip、六态映射与七日过期 tooltip 全部不变
