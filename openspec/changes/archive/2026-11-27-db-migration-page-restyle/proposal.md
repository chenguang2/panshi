# Proposal

## Why

数据迁移页是「页面美化（proposal-c 控制台语言）」批次里尚未改版的系统管理页。功能本体已在 `db-migration-ux-optimization`（commit c977ed01）交付——独立页、高危确认弹窗、SSE 进度、进行中恢复、历史管理、就地切换——但呈现层仍是旧语言：

- 卡片外壳是旧 `.card`，迁移任务卡卡头只有一枚刷新按钮，无标题/副注（设计页有「迁移任务 · 单向快照替换……」卡头）；
- 历史区嵌在迁移卡内部（同一张卡的第二段），用 a-table 内置分页 + `:scroll max-content`（违反 r6 红线 #83：窄窗口必横向溢出）+ `a-tag` 状态 + 无 `#` 序号列；
- 进度区两处实现（SSE 态 / API 恢复态）各画各的，emoji 标签（📦/🔄）+ a-progress 硬编码 antd 色（`#1890ff`/`#52c41a`），与设计页「mono 阶段徽标 + 自绘进度条」解剖不符；
- 结果条用硬编码 antd 绿（`#f6ffed`/`#b7eb8f`/`#52c41a`），状态带缺「可用连接 N」段且待重启段用 antd 黄硬编码；
- 页内四处 `a-alert`（锁横幅 / 确认弹窗警告 / 清理弹窗警示 / 重启指引横幅），与已改版页的 `.alert` 主题横幅不同族。

设计页 `docs/ui/Live-Artifact-5/proposal-c/db-migration.html` 已生成入库（commit f80448cc），本轮按设计页实施。

## What Changes

- **迁移任务卡卡头**：`.card` → `.l5-card` + `.mig-cardhead`（标题「迁移任务」+ 副注「单向快照替换：先备份源库，再清空目标库写入」+ 头部动作刷新按钮）；`mig-*` 解剖块进 `style.css` 单一来源（同 `dbm-*` 先例）。
- **历史独立成卡**：历史区从迁移卡内部拆出为独立 `DbMigrationHistoryCard.vue`（`l5-card` + 卡头「历史迁移记录」+ 副注「仅当前活动库的记录；切换数据库后从零开始记录」+ `ph-lite` 计数 + 清理历史按钮）；迁移完成后经 expose 的 refresh 联动刷新。
- **历史表解剖**：a-table 挂 `grid-table` 解剖 + `:scroll` 数值最小总宽（1025，禁 `max-content`）+ `:table-layout fixed` + 新增 `#` 序号列（45px）+ 设计列宽（300/84/96/92/96/156/156）；状态列 `a-tag` → 语义胶囊（成功 `pill-run` / 失败 `pill-stop`）；迁移方向列 `lp-tag` + mono 箭头；模式列弱化 `c-dim`；数值/时间列 mono；内置分页 → 外置 `ListPager`；行展开（失败原因中文转译 + 备份路径复制）原样保留。
- **统一进度面板**：SSE 实时态与 API 恢复态合并为同构 `mig-progress` 解剖——mono 阶段徽标（`BACKUP`/`MIGRATING`）+ 自绘进度条（迁移 accent / 备份完成段 success 绿）+ meta 行（当前表 / 已迁移 N / M 行 / 起始时间 mono）+ 右下「断开实时进度」（`btn-danger btn-sm`）；progress 数据缺失时呈骨架行（阶段徽标 + 提示文案），不渲染假进度条；迁移锁 a-alert 横幅删除（锁态由状态带 lock 段 + 进度面板承载，设计页样张即此形态）。
- **结果条 token 化**：`.migrate-result-bar` 改设计 token（success 系 oklch 边框/淡底 + `var(--success)` 徽标 + meta mono），结构不变（结论 + 表数/耗时/备份 + 查看迁移详情 + 去切换数据库）。
- **状态带补全**：新增「可用连接 N」段；活动库类型标签 `badge-neutral` → `lp-tag tech`；待重启段改主题 warning token 色（弃 antd 黄硬编码）；数据源不变（status + running-tasks + connections props）。
- **弹窗与横幅主题化**：确认弹窗的清空覆盖警告 `a-alert` → 主题 `.alert .alert-error`（StrokeIcon warning + alert-content；空目标降级分支保留语义、换 `.alert-info`）；清理弹窗的「删除不可撤销」`a-alert` 降级为预览行附注小字（scope 说明文字保留、形态贴设计页）；重启指引横幅 `a-alert` → `.alert.alert-warning`（可关闭、刷新后消失语义不变）。
- **连接不足禁用面**：可用连接不足时除发起按钮外，「单阶段超时」下拉与「包含日志数据」勾选一并禁用（设计样张 is-disabled 形态）；提示行 + `?wizard=1` 深链「去新建连接」原样保留。
- **详情抽屉解剖**：`a-descriptions` → 手写四格 grid（源/目标/表数/耗时 + 备份路径通栏 mono）；三组表明细 `a-table` 挂 `grid-table` 解剖（表名/列数/行数，设计列宽 260/110/110），组内滚动与日志豁免提示、后续启用步骤原样保留；抽屉壳仍为 `a-drawer`（760）。
- **守卫接线**：`mockupParity.source.test.ts` 增「数据迁移」段源码红线；`pageHeaderActions.source.test.ts` PAGES 清单加本页（设计页无页头动作/无页头徽标，双侧皆无为守卫基线）；`StatusBand.test.ts` / `DbMigrationCard.test.ts` / `DbMigrationPage.test.ts` 断言随改版反转。
- **设计页口径微调**（tasks 收口段）：历史表 min-width 1070 → 与列宽和 1025 对齐；卡头补「仅显示最近 100 条」截断披露注记（后端 LIMIT 100 事实，实现保留 cap-hint）。
- **零行为变更**：SSE 事件语义与断连不取消、确认流（保守恒显清空警告）、活动库约束前置与源预选、清理预览/执行口径、历史状态映射、就地切换与重启指引、写锁 UX 提示、权限与功能开关门控全部不动；后端零改动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无——既有行为契约零改动）

### Added Capabilities

- `db-migration-page`：ADDED「数据迁移页控制台解剖」——状态带可用连接段与 token 色、迁移任务卡/历史卡卡头、统一进度面板解剖（含恢复态骨架）、结果条 token 化、历史表 grid-table 解剖与外置分页、弹窗与横幅主题化、连接不足禁用面、详情抽屉解剖。既有「数据迁移独立页面」「迁移发起高危确认」「活动库约束前置与源预选」「迁移历史失败原因可见」「迁移页状态带」等行为契约原文保留、零改动。

## Impact

- `frontend/src/components/DbMigrationCard.vue`：卡头/流向面板/进度/结果条/抽屉解剖重写 + scoped 样式 token 化；历史区代码移出。
- `frontend/src/components/DbMigrationHistoryCard.vue`（新）：历史卡自持加载/分页/清理弹窗/行展开；`defineExpose(refresh)` 供迁移完成后联动。
- `frontend/src/components/StatusBand.vue`：可用连接段 + `lp-tag tech` + warn token 色。
- `frontend/src/views/DbMigrationPage.vue`：重启指引横幅主题化；迁移完成 → 历史卡 refresh 接线。
- `frontend/src/style.css`：新增 `.mig-*` 解剖块（卡头/状态带段/进度面板/结果条）单一来源。
- `frontend/src/components/__tests__/{DbMigrationCard,StatusBand}.test.ts`、`frontend/src/views/__tests__/{DbMigrationPage,mockupParity.source,pageHeaderActions.source}.test.ts`：断言反转与新增红线。
- `docs/ui/Live-Artifact-5/proposal-c/db-migration.html`：两处口径注记（不新增页面、不改版式）。
- 后端零改动。
