# clickhouse-config-page-restyle 验收记录（2026-11-25）

基准：`docs/ui/Live-Artifact-5/proposal-c/clickhouse-config.html`（用户已批准）。视口 1600×1000。

## parity 量测

量测脚本：本目录 `ck-parity.cjs`（九维度）。**零差异元素**：卡头标题/副注、判定胶囊几何、连接名/地址、meta 行 tool-btn、页头徽标（accent/bad）、表头解剖（9px 12px / --bg 底 / muted 色 35px，经 `table-container` 接管）、`op-pub` 设为当前、test-fail 色。

**已解释变体**（非差异）：

- verdict-pill 色（设计=绿可达 / 实现=红不可达）：真机库内 ClickHouse 实测不可达——四态绑定实测正是 spec 契约；两变体 CSS 同源（style.css `.pill-run`/`.pill-stop`）。
- meta 按钮 markup 路径（设计 `.ck-meta` 直挂 / 实现包 `.ck-actions`）：按钮本体同为全局 `.tool-btn`，样式零差异。
- 表头首列圆角 8px 0 0：antd 表格在圆角卡内的首列圆角，节点管理等对齐目标同款；设计页画方角为基线简化。
- 表头高 35 vs 35.5：亚像素舍入。

**基线修订**：`theme.css` 的 `.ph-lite.lite-bad` 背景对齐全局（oklch 10%，与 style.css `--danger-bg` 等值）——共享原语单一事实源（#82）。

## 截图

`design-page.png`（设计页）/ `impl-page.png`（实现真机，真实数据：库内 ClickHouse 不可达，红胶囊 + 中文摘要 + 查看详情展开 + 上次测试 ✗ 列 + op 层级全部如实呈现）。

## 测试与回归

- 守卫先行 RED→GREEN：`pageHeaderActions` PAGES +1 对（徽标断言先红后绿）；`mockupParity` clickhouse 段 3 条红线（grid-table + 禁旧 accent 大写表头回流 / pill 判定结构含 status-dot 语义类 / PageStatBadges）。
- 既有 `ClickHouseConfig.test.ts` 13 例：`.status-dot.online/.offline`、`.health-verdict` 文案、`.health-error` 摘要、`.mock-empty` CTA 契约零破坏（判定胶囊色点挂 status-dot 语义类的设计决策生效）；仅操作列选择器反转 3 处 `.btn-primary` → `.op-pub`。
- `npx vue-tsc -b` 0 error；focused 312 passed（ClickHouseConfig + 三守卫 + tableAnatomy）。
- 全量 `npx vitest run --maxWorkers=4` 三轮：失败集逐轮轮换（DbBackupCard/RelayTopologyCard → AuditLog → AnsibleInventory/RelayGateways，均未改动文件），隔离复跑全绿（51/105 例两批）——按 AGENTS #58 定性 CPU 争抢型波动，非回归。本轮唯一真回归 = `#` 列宽 40（#59 统一解剖），已修正为 45 并由 tableAnatomy 守卫钉住。

## 行为等价性

- 健康/测试/激活/CRUD 状态机零改动（`runHealthCheck`/`handleActivate`/`handleDelete`/校验函数原样）；「设为当前」「删除」的激活保护从按钮样式迁移为禁用 + title 理由，语义不变。
- 空态换共享 EmptyState（empty5 原语），默认参数回落说明与「新建连接」CTA 保留。
