# Verification · db-migration-page-restyle

日期：2026-11-27 · 方法：AGENTS.md #82 parity 五步法（同数据注入 → 逐元素量测 → 清单先行 → 批准后改 → 批次落地复测）

## 1. 同数据注入

活动库 = `sqlite_export_test`（`backend/db_config.json` active，落点先核后写，AGENTS.md #14/#68）。
`ps_db_migration_log` 造 5 行（4 成功 + 1 失败带可转译错误信息 + 备份路径，backup_path 带 `parity_seed` 标记），
加上库内既有 1 行共 6 条（对齐设计页样张条数）；**验证完成后造数行已按标记精确删除**（复核 remaining=1）。

## 2. 逐元素量测（24 对元素 × 14 属性，Playwright 1600×1000 双侧）

量测脚本 `parity.cjs`（本目录），报告 `parity-report.json`；颜色经 canvas 绘制取像素归一（#82），
数值类属性 1px 舍入豁免，文本类元素 width 不参评（容器/内容驱动）。

**首轮扫描（改版前）暴露并已修复的 6 项差距**：

| # | 差异 | 根因 | 修法 |
|---|---|---|---|
| 1 | 历史表头 14px/白底/47px ≠ 设计 11px/muted/35px | 表格解剖样式作用域在 `.table-container`，历史卡根节点漏挂该类 | 历史卡根补 `table-container` |
| 2 | 1366 视口历史表 29px 行内滚动 | a-table 展开图标列 48px + 设计列宽和 1025 > 卡内容宽 | 列宽按 1366 内容宽重排（方向 276/表数量 88/时长 92/时间 150×2，和 981），设计页 colgroup 同步 |
| 3 | 历史表再 +3px 内容溢出 | 设计 td 自带 overflow+ellipsis 裁内容，实现 td 不裁，时间列 mono 内容 157px 超列宽 | 历史表 td 补同款裁剪（scoped :deep） |
| 4 | 流向控件粗一档（标签 12px、下拉 36px、危险徽签带底胶囊） | 上一轮（ux-optimization）形态与设计页密度不同 | 对齐设计：标签 11px、下拉 32px/12.5px、超时宽 132px、危险徽签改裸警示文本（11.5px/400 无底） |
| 5 | 风险面板密度差（标题 12px、自绘 · 项目符、12px 正文） | 同上 | 对齐设计：标题 11px、原生 disc 项目符、12.5px/1.6 |
| 6 | 卡头刷新按钮 24px ≠ 设计 tool-btn 30px | 刷新按钮沿用了 btn-sm | 换全局 `.tool-btn`（30px 工作台卡头解剖） |

**终版复测（24 对）**：22 对全 ✓；3 项记录为接受残余（见 §4）。

## 3. 横向溢出扫描（r6 口径，六档取二）

| 视口 | tableScrollWidth | clientWidth | 结论 |
|---|---|---|---|
| 1600 | 1278 | 1278 | 零溢出 |
| 1366 | 1044 | 1044 | 零溢出（首轮 29px→修后归零） |

## 4. 接受残余（3 项，均为全局既有关系或不可静态呈现态）

1. **表格文本色**：实现侧 a-table 单元格走 antd `colorText`（#1a1a2e），设计走 `--fg`（oklch(20% .02 240)，像素 ≈ rgb(14,23,30)）——antd 令牌与设计 token 的既有全局关系，database-management-page-restyle 6.4 同款残余，不页面级覆盖。
2. **风险条目行高**：设计面板 290px 宽文案折两行（40px）、实现 417px 宽单行（20px）——面板宽度来自 35% flex × 卡宽差，字号/行高/间距已全对齐，纯内容折行差异。
3. **重启指引横幅样张**：仅就地切换成功后出现，静态对比不存在（形态由 `DbMigrationPage.test.ts` DOM 断言 + 设计样张核对）。

## 5. 回归证据

- `npx vue-tsc -b` 通过（每轮改后复跑）。
- 定向 6 文件 392 用例全绿 ×2 轮（`DbMigrationCard` / `DbMigrationHistoryCard` / `StatusBand` / `DbMigrationPage` / `mockupParity.source` / `pageHeaderActions.source`）。
- 全量 `npx vitest run --maxWorkers=4` 两轮：第一轮 6 失败（节点页双计数/阻断弹窗 + 迁移 SSE 进度），第二轮 4 失败（插件下拉/版本弹窗/发布引导/sm2 mTLS）——失败集逐轮轮换且全部隔离复跑绿，迁移域定向两轮全绿，按 AGENTS.md #58 定性为 CPU 争抢型波动，非回归。
- E2E 锚点核对：`e2e/database-management.spec.ts` 迁移用例依赖 `.migrate-btn` 与错误 toast 文案，本轮均未变动。

## 6. 截图

- `design-1600.png`（设计页 file://，fullPage）
- `real-1600.png`（实现页登录态，fullPage）
- `real-1366.png`（1366 视口，零横向滚动证明）
- 注：png 受仓库 .gitignore（`*.png` 白名单仅 user-manual）约束，本地存档不入库。
