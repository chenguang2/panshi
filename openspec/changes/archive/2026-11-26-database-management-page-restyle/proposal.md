# Proposal

## Why

数据库管理页是「页面美化（proposal-c 控制台语言）」批次里尚未改版的系统管理页：当前仍是旧卡片语言——`.card` + 页内 accent 大写表头 + `a-tag` 三态、备份/迁移摘要卡上下堆叠且 4 列统计在窄容器里换行、页头无统计徽标。设计页 `docs/ui/Live-Artifact-5/proposal-c/database-management.html` 已完成并经用户批准（2026-11-26），本轮按设计页实施。

## What Changes

- **页头统计徽标**：接入 `PageStatBadges`，至多两枚——首枚恒为「N 条连接」；第二枚按严重度取「待重启生效」（`pending_restart` 为真时，warn）或「K 条验证失败」（页面内测试失败计数，bad），两者皆无则不渲染。数值取当前已加载数据集，不虚构。
- **当前数据库 hero**：`.card` → `.l5-card` + 卡头（标题 + 语义副注「切换写入配置后需重启后端服务才生效；期间页面数据仍来自旧库」）；正文升级为 hero——24px 判定胶囊（运行中 `pill-run` / 待重启 `pill-warn`）+ 当前类型 `lp-tag tech` + 连接名 15px/600 + 等宽地址 + 元信息行（连接注册表条数 · 配置版本 · 会话后果）；未配置时保留空态。
- **连接列表**：`.card` → `.l5-card` + 卡头；a-table 挂 `grid-table` 解剖（去掉页内 accent 大写表头 `:deep` 旧样式），新增 `#` 序号列（跨页公式 `index + 1`，本表 `:pagination="false"`）；状态列由 `a-tag` 改三态胶囊（已连通 `pill-run` / 验证失败 `pill-stop` / 未验证 `pill-unknown`，tooltip 语义与「结果仅保留到页面刷新」披露原文保留）；类型列改 `lp-tag`（当前连接 accent）；当前连接行加左缘 accent 条（`.dbm-row-current`）；操作列改图标 `op` 族并建立层级——测试 / 编辑 = `op-btn`、设为当前 = `.op-pub` 行内主操作（当前连接禁用）、删除 = `op-btn` 红（当前连接禁用 + 保护理由 tooltip）。
- **摘要双卡并排**：`DbBackupSummaryCard` 与 `DbMigrationSummaryCard` 由上下堆叠改 `.dbm-two` 两列并排，卡内四格统计改 2×2（半宽卡里 4 列放不下时间戳，必然折行）；两卡改用共享卡头/正文解剖（`.dbm-cardhead` / `.dbm-body`），根节点去掉左侧 accent 竖条（设计页两卡同款无竖条）。
- **待重启三处提示**：`pending_restart` 为真时，页头徽标、hero 名称行徽标（`.ph-lite.lite-warn`）、hero 警示条（重启命令）三处同时出现——缺任一处用户会误以为切换失败。
- **守卫接线**：`mockupParity.source.test.ts` 增「数据库管理」段源码红线；`DatabaseManagement.test.ts` 状态 tag / 设为当前按钮的选择器随改版反转，新增页头徽标与当前行标识用例。设计页同步三处口径修正（`#` 列 45px、待重启文案去掉 API 无法提供的「旧库名」、页头第二枚徽标优先级）。
- **零行为变更**：连接 CRUD / 测试 / 切换 / 删除行为、表单校验、审计、权限与功能开关门控、摘要卡数据口径全部不动；后端零改动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无）

### Added Capabilities

- `database-management`：ADDED「数据库管理页页面解剖」——页头徽标 / 当前库 hero / 连接列表解剖与操作层级 / 当前行标识 / 摘要双卡并排 / 待重启三处提示 / 窄屏单列。既有「当前数据库状态展示」「连接配置管理」的行为契约（三态诚实、当前连接不可删除、切换待重启语义）原文保留、零改动。

## Impact

- `frontend/src/views/DatabaseManagement.vue`：模板（页头徽标 / hero / 表格列与单元格 / 摘要卡容器）+ scoped 样式重写；`<script>` 新增 `headerStatItems` computed 与三态胶囊 class 映射，交互逻辑零改动。
- `frontend/src/components/DbBackupSummaryCard.vue`、`frontend/src/components/DbMigrationSummaryCard.vue`：卡头/正文解剖与 2×2 统计格；数据取数与降级文案零改动。
- `frontend/src/style.css`：新增 `.dbm-*` 解剖块（数据库管理页三张卡共享：卡头 / 正文 / hero / 双卡并排 / 当前行标识）单一来源。
- `frontend/src/views/__tests__/DatabaseManagement.test.ts`：状态列 tag 断言 → 胶囊断言；「设为当前」按钮断言 → `.op-pub`；新增页头徽标（含优先级）与当前行标识用例。
- `frontend/src/views/__tests__/mockupParity.source.test.ts`：新增「数据库管理」段源码守卫。
- `docs/ui/Live-Artifact-5/proposal-c/database-management.html`：三处口径修正（不新增页面、不改版式）。
- 后端零改动。
