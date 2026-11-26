# Tasks

## 1. 守卫先行（RED）

- [x] 1.1 `pageHeaderActions.source.test.ts` PAGES 加 `['DatabaseManagement.vue', 'database-management.html']`，运行确认徽标一致性断言对现状转红（设计有 `.ph-inline` / 实现无 `PageStatBadges`）、动作数双侧一致（均为 1）
- [x] 1.2 `mockupParity.source.test.ts` 增「数据库管理」段 5 条源码红线（页头徽标 / hero 解剖 / `grid-table` 且禁旧 accent 表头 / 摘要双卡 `.dbm-two` + 2×2 / 三态胶囊 + `.dbm-row-current` + `.op-pub`），确认对现状 RED
- [x] 1.3 `DatabaseManagement.test.ts` 反转既有断言（`.conn-status-tag`+`ant-tag-success|error` → `.conn-status-pill`+`pill-run|pill-stop|pill-unknown`；`.set-current` 的 `btn-secondary` → `.op-pub` 且非 `btn-primary`），并新增用例：页头两枚徽标与优先级、当前行 `.dbm-row-current`、序号列渲染；确认 RED

## 2. 共享解剖与 hero（GREEN-1）

- [x] 2.1 `style.css` 新增 `.dbm-*` 解剖块（卡头 / 正文 / hero / 双卡并排 / 当前行标识），注释标注设计与消费方
- [x] 2.2 `DatabaseManagement.vue` 页头接入 `PageStatBadges`（`headerStatItems`：条连接 + 待重启/验证失败优先级），验证 1.1 转绿
- [x] 2.3 当前数据库卡改 hero 解剖（判定胶囊 `pill-run|pill-warn` + `lp-tag tech` + 名称/地址/元信息 + 待重启名称行徽标与警示条），保留 `.pending-restart-badge` / `.pending-restart-hint` 类与「数据仍来自旧库」文案

## 3. 连接列表（GREEN-2）

- [x] 3.1 连接列表迁 `l5-card` + 卡头；a-table 挂 `connection-table grid-table` + `:scroll`/fixed layout + 列宽（45/100/158/108/252/74/77/262）；删除页内 accent 大写表头 `:deep` 旧样式
- [x] 3.2 新增 `#` 序号列（`index + 1`）；状态列改三态胶囊（`.conn-status-pill`，tooltip 原文保留）；类型列改 `lp-tag`（当前行 accent）；当前列保留绿色「当前」胶囊
- [x] 3.3 操作列改 `op` 族：测试 `op-btn` / 设为当前 `.op-pub`（当前行禁用）/ 编辑 `op-btn` / 删除 `op-btn` 红（当前行禁用 + `.tip-host` tooltip 原文保留）；`row-class-name` 输出 `.dbm-row-current`
- [x] 3.4 验证 1.2 / 1.3 转绿

## 4. 摘要双卡（GREEN-3）

- [x] 4.1 `DbBackupSummaryCard.vue`：根 `l5-card`、卡头/正文换共享 `.dbm-cardhead`/`.dbm-body`、统计改 2×2、去掉左侧 accent 竖条；取数与降级文案零改动
- [x] 4.2 `DbMigrationSummaryCard.vue`：同上；两卡在父页面包进 `.dbm-two`
- [x] 4.3 校验：`DbBackupSummaryCard`/`DbMigrationSummaryCard` 用例全绿（含权限/开关门控与 N/M 目标断言）

## 5. 设计页口径修正与回归收口

- [x] 5.1 设计页三处修正：`#` 列 40→45、待重启警示条删去 API 不具备的「旧库名」、页头第二枚徽标优先级注记
- [x] 5.2 `npx vue-tsc -b` 通过；`npx vitest run src/views/__tests__/DatabaseManagement.test.ts src/views/__tests__/mockupParity.source.test.ts src/views/__tests__/pageHeaderActions.source.test.ts --maxWorkers=2` 全绿
- [x] 5.3 全量 `npx vitest run --maxWorkers=4`（漂移失败按 #58 隔离复跑定性）
- [x] 5.4 parity 五步法收口：1600×1000 双侧截图 + 逐元素量测（页头/hero/表格/摘要双卡/弹窗），差异清单复核；截图与脚本存档至本变更 `verification/`

## 6. 真机复测追加（parity 发现，详见 verification/verification.md）

- [x] 6.1 长内容列（名称/地址/用户名）单行省略 + `title`，行高由 56/57/77px 混排收敛为 45px
- [x] 6.2 列宽按真实数据重排（合计 1072 = `:scroll.x`；1366 零行内滚动、零截断）
- [x] 6.3 当前行底色提权（`.table-container .grid-table …` + `!important`，破全局 transparent）与表头首末列圆角归零
- [x] 6.4 `db-parity.cjs` 复跑：10 元素 × 8 属性仅剩 2 项残余（th 高 0.5px 舍入 / antd `colorText` 与设计 `--fg` 的既有 token 关系），均已归因记录
