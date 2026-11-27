# Tasks

## 1. 守卫先行（RED）

- [x] 1.1 `mockupParity.source.test.ts` 增「数据迁移」段源码红线：`DbMigrationCard.vue`/`DbMigrationHistoryCard.vue` 挂 `l5-card` + `.mig-cardhead` 卡头（标题+副注）、历史卡含 `ListPager`、历史表 scroll 为数值（禁 `max-content`）、历史状态列禁 `a-tag`（用 `pill`）、进度面板用 mono 阶段徽标（禁 emoji 📦/🔄）、本页三文件禁 `a-alert`、`StatusBand.vue` 含「可用连接」段且 warn 段无硬编码 antd 黄——运行确认对现状 RED
- [x] 1.2 `pageHeaderActions.source.test.ts` PAGES 加 `['DbMigrationPage.vue', 'db-migration.html']`（双侧皆无动作/徽标基线），确认现状绿（守卫防回流）
- [x] 1.3 `StatusBand.test.ts` 断言反转（可用连接段 / `lp-tag tech` / warn token），`DbMigrationCard.test.ts` 反转卡头/进度/结果条/抽屉/弹窗断言并移出历史用例，新增 `DbMigrationHistoryCard.test.ts`（解剖/外置分页/清理弹窗/行展开），`DbMigrationPage.test.ts` 反转横幅断言并加「迁移完成 → 历史卡 refresh」接线用例——确认 RED

## 2. StatusBand 与页壳（GREEN-1）

- [x] 2.1 `StatusBand.vue`：新增「可用连接 N」段（connections prop 计数）；类型标签 `badge-neutral` → `lp-tag tech`；warn 段改主题 token（`var(--warning)` + oklch 淡底/描边，弃 `#ad6800/#fffbe6/#ffe58f`）；验证 1.3 StatusBand 断言转绿
- [x] 2.2 `DbMigrationPage.vue`：重启指引横幅 `a-alert` → `.alert.alert-warning`（StrokeIcon warning + alert-content，保留 closable/刷新消失语义与既有文案、`code` 命令样式）

## 3. 迁移任务卡（GREEN-2）

- [x] 3.1 `style.css` 新增 `.mig-*` 解剖块：卡头（标题/副注/头动作）、状态带复用段不新增（StatusBand 已自持）、进度面板（徽标/条/meta/脚注）、结果条 token 化——注释标注设计来源与消费方
- [x] 3.2 `DbMigrationCard.vue` 外壳：`.card` → `l5-card` + `.mig-cardhead`（「迁移任务」+ 副注 + 刷新按钮入头动作区）；删除迁移锁 `a-alert` 横幅与旧 `migration-progress-detail`（API 恢复态并入统一进度面板）
- [x] 3.3 统一进度面板：BACKUP/MIGRATING mono 徽标 + 自绘 `.bar`（迁移 accent；token 色）+ meta（当前表/已迁移行数/起始时间 mono）+ 右下「断开实时进度」`btn-danger btn-sm`（`a-button` 退场）；恢复态 progress 缺失渲染骨架行（不渲染假进度条）
- [x] 3.4 结果条 token 化（弃 `#f6ffed/#b7eb8f/#52c41a`；meta mono）；连接不足时超时下拉与日志勾选禁用；确认弹窗警告 `a-alert` → `.alert .alert-error`（StrokeIcon；保守恒显逻辑不变）
- [x] 3.5 详情抽屉：`a-descriptions` → 四格 grid（`mig-desc`：源/目标/表数/耗时 + 备份路径通栏 mono）；三组表明细 `a-table` 挂 `grid-table`（列宽 260/110/110，组内滚动）；日志豁免提示与后续步骤保留
- [x] 3.6 迁移完成后调用历史卡 refresh（`historyCardRef.value?.refresh()`）；验证 1.3 DbMigrationCard 相关断言转绿

## 4. 历史记录卡（GREEN-3）

- [x] 4.1 新建 `DbMigrationHistoryCard.vue`：独立 `l5-card` + `.mig-cardhead`（标题/副注/`ph-lite` 计数 + cap-hint + 清理历史按钮）；历史加载/分页/清理弹窗/行展开/复制逻辑自 `DbMigrationCard` 平移（数据流不变）；`defineExpose({ refresh })`
- [x] 4.2 历史表解剖：a-table 挂 `grid-table` + `:scroll="{ x: 1025 }"` + `:table-layout="'fixed'"`；新增 `#` 序号列（45px，`index + 1`）；列宽 300/84/96/92/96/156/156；方向列 `lp-tag` + mono 箭头；模式列 `c-dim`；状态列 `pill-run/pill-stop`（弃 `a-tag`）；数值/时间列 mono；内置分页 → 外置 `ListPager`（`:pagination="false"`）
- [x] 4.3 清理弹窗：`a-input-number` → 设计输入形态（120px mono 居中）；「删除不可撤销」`a-alert` → 预览行附注小字（scope 文字与「执行中的记录不会被删除」并入预览文案）；无可删禁用提交不变
- [x] 4.4 `DbMigrationCard.vue` 移除历史区代码（模板/script/样式）；验证 1.3 历史卡断言转绿

## 5. 回归收口

- [x] 5.1 `npx vue-tsc -b` 通过；定向 `npx vitest run src/components/__tests__/DbMigrationCard.test.ts src/components/__tests__/DbMigrationHistoryCard.test.ts src/components/__tests__/StatusBand.test.ts src/views/__tests__/DbMigrationPage.test.ts src/views/__tests__/mockupParity.source.test.ts src/views/__tests__/pageHeaderActions.source.test.ts --maxWorkers=2` 全绿
- [x] 5.2 全量 `npx vitest run --maxWorkers=4`（漂移失败按 #58 隔离复跑定性；同文件稳定复现才是回归）
- [x] 5.3 设计页口径微调：`db-migration.html` 历史表 `min-width:1070px` → 1025（列宽和）；卡头注记「列表为最近 100 条（后端返回上限），清理预览数字取服务端真实总数」
- [x] 5.4 parity 五步法收口：Playwright 1600×1000 双侧截图（设计页 file:// vs 登录后真实页，造数至少 6 条历史含 1 条失败）、逐元素量测（页头/状态带/任务卡/进度/结果条/历史表/三弹窗/抽屉九子域）、差异清单复核；截图与量测脚本存档至本变更 `verification/`
