# Tasks: DB Migration UX Optimization

## 1. 视觉基线与规格收口前置

- [x] 1.1 开发服务恢复后补截图基线：`/database-management`、`/db-migration`（表单展开/进行中/失败态）、`/backup-management` 各至少 1 张，输出 `/tmp/opencode/migration-ux-shots/`（不得写入 docs/user-manual/images），对照 design.md 复核问题严重度与布局方案，偏差回写 design.md（已完成三页静态基线；进行中/失败态随 11.5 实测补齐；基线另发现历史表迁移方向列显示原始连接 ID，已纳入 lane E）
- [x] 1.2 跑 `openspec validate --all` 确认本变更 0 error 后再动代码（196 passed / 0 failed）

## 2. 后端小修（utcnow + 503 文案）

- [x] 2.1 TDD：先在 `backend/tests/` 写失败用例——迁移锁激活时 `running-tasks`/503 detail 返回的 `started_at` 为 naive UTC（与 `datetime.utcnow()` 偏差 < 分钟级）、503 detail 含「{源} → {目标}」与「进度见『数据迁移』页」指引；验证 RED（3 failed，本机 UTC+8 偏差 8h 触发）
- [x] 2.2 `maintenance.py`：`started_at=datetime.now()` → `datetime.utcnow()`；锁 detail 文案出口化（源→目标标识 + 自动恢复 + 进度页指引）；验证 2.1 用例 GREEN（3 passed；源→目标经 `_connection_label` 优先连接名、回退 ID）
- [x] 2.3 按 AGENTS.md #51 跑全域回归 `uv run pytest -k "database or migration or maintenance"` 全绿（197 passed / 7 skipped / 0 failed；`test_migration_lock_real_app.py` 8 个旧文案全等断言按新语义最小修正，并补「请稍后重试 not in detail」钉死旧文案不复活）

## 3. 迁移发起高危确认 + G8 前置（P0）

- [x] 3.1 TDD：`DbMigrationCard.test.ts` 新增失败用例——非空目标点击「开始迁移」弹确认弹窗（含源/目标标识与地址、清空覆盖警告、备份源库与 10 份保留说明、写锁说明、超时摘要）、取消不发起、空目标警告降级、表单无「我了解将清空目标库」勾选框；验证 RED（组 3+4+10 合并 RED 27 failed）
- [x] 3.2 实现确认弹窗（handler 提取为 script 函数，防 #25 prettier 重排陷阱），移除勾选框与直发路径；验证 3.1 GREEN（42/42；**偏差备案**：`target_is_empty` 无端点暴露——designer 报告此处失实——空目标降级以保守恒显警告落地，delta spec 已修订为「可判定时降级、不可判定保守恒显」，接入缝已预留）
- [x] 3.3 TDD：失败用例——目标下拉禁用当前活动库（标注「当前活动库，不可作为目标」）、源下拉默认预选活动库（标注「当前」）、活动库变更后联动刷新；验证 RED 后实现 GREEN（activeConnId 经页面 status 下传；用户手动改过源则尊重选择）
- [x] 3.4 模式选择改危险标签（移除单选项下拉），文案「替换模式 · 目标库现有数据将被清空覆盖，不可撤销」；同步更新受影响快照/断言（提交参数 mode='replace'/confirmedClear 不变）

## 4. 断开监视语义（P0）

- [x] 4.1 TDD：失败用例——按钮文案「断开实时进度」、点击后提示「已断开本页进度显示；迁移在后台继续执行，写操作锁定保持至迁移结束」、断开后轮询恢复进行中展示、`cancelled → 已取消` 映射移除；验证 RED
- [x] 4.2 实现 `handleCancelMigration` 语义改造（`DbMigrationCard.vue`）+ `DbMigrationSummaryCard.vue` 死映射清理（错误态分支化：403 权限/其他网络）；验证 4.1 GREEN

## 5. 迁移历史失败原因可见（P0）

- [x] 5.1 TDD：失败用例——失败历史行展开显示 `error_message`（失败样式）与 `backup_path`（等宽 + 复制按钮）；成功行展开仅显示备份路径；行高一致（meta 行占位，#54）（RED 5 failed）
- [x] 5.2 实现 a-table expandable 行展开（数据取既有接口字段，零后端改动）；验证 5.1 GREEN（39/39；失败原因复用连接测试分类器转译，无法分类加「迁移失败：」前缀；附带项方向列 connLabel 映射行为以 2 条回归钉死——基线截图显示原始 ID 系注册表无该连接）

## 6. 迁移页状态带（P1）

- [x] 6.1 新建状态带共享组件（当前活动库 / 待重启警示 / 迁移锁进行中，数据源 `GET /database/status` + `GET /database/running-tasks`），TDD：三态渲染用例先红后绿（7 用例；纯展示组件，props: status/migration/connections，403 整条隐藏）
- [x] 6.2 `DbMigrationPage.vue` 接入状态带；mock 数据形状以 curl 实测响应为准（#43 教训）（页面持 status/connections 同源下传，锁态经页面 5s 轮询刷新；DbMigrationPage.test.ts 追加 4 用例）

## 7. 全局迁移锁横幅（P1）

- [x] 7.1 TDD（组件级）：失败用例——503 锁响应触发 App 层横幅（源→目标 + 写锁说明 + 进度页入口）、写成功后横幅移除、无锁页面首渲无横幅（7 用例：拉起/降级/关闭/再拉起/写成功清除/首渲无/清除无副作用）
- [x] 7.2 实现：axios 拦截器识别 503 锁标记 → 拉起横幅 + 一次性 running-tasks 填充；事件驱动零轮询；验证 7.1 GREEN（window CustomEvent 契约同站点既有模式；403 降级只显 503 detail；z-index 1050 介于页头与弹窗之间）

## 8. DatabaseManagement 错误反馈与校验（P1）

- [x] 8.1 TDD：失败用例——PG 表单主机/数据库名为空阻断提交并标注字段错误；写操作（切换/保存/删除/测试）失败时中文错误上屏（503 锁含出口指引、400/422 显后端原因、网络错误分类）；验证 RED（16 用例颗粒度失败）
- [x] 8.2 实现全部写操作 try-catch + 分类反馈（`DatabaseManagement.vue`），错误分类复用连接测试分类器思路；验证 8.1 GREEN（`extractWriteError` 分类器：detail 直出/503 出口指引防重复/网络错误兜底；失败时弹窗保持打开）
- [x] 8.3 连通性状态升级：圆点改文字 tag 三态，title 披露「测试结果仅保留到页面刷新」（列宽 30→84、表头置「状态」；「当前」列正交保留）

## 9. 就地切换与共享弹窗（P1）

- [x] 9.1 将切换确认弹窗提升为 `SwitchConnectionModal` 共享组件（`DatabaseManagement.vue` 与迁移页复用，对齐 #7 精神），TDD：两处挂载行为用例先红后绿（契约：props open/connection/activeName?，emits confirm 不自关 + cancel；8 组件用例 + 2 接入用例）
- [x] 9.2 迁移页结果条「去切换」改为原页弹窗（预选目标连接），切换成功即时展示重启指引横幅（复用既有待重启指引文案）；移除纯跳转行为（SwitchConnectionModal 契约消费：connection/activeName 预选；成功 message + a-alert 重启指引 + loadStatus 联动状态带黄标；DbMigrationPage.test.ts 10 用例）

## 10. 两栏布局与信息层级（P1）

- [x] 10.1 迁移卡改两栏（流向表单 + 风险说明面板），补 `@media` 断点修复窄屏横向溢出；截图验证 900px/1280px 两档不溢出（代码级完成 + 900px 竖排断点；两档截图验证随 11.5 实测执行）
- [x] 10.2 移除卡片内 h3 双标题；「可用连接不足」附「去新建连接」直达数据库管理页新建弹窗（复用 `?wizard=1` query 预置模式；接收端由 Lane D 同步实现）

## 11. 收口回归与验收

- [x] 11.1 定向回归：`npx vitest run`（DbMigrationCard/DbMigrationSummaryCard/DatabaseManagement/新增组件 + 受影响用例）全绿（各 lane 完成、主会话复跑抽查：63+48+7+49 全绿）
- [x] 11.2 前端全量：`npx vitest run --maxWorkers=4` 全绿（#58 基线；171 文件 2254/2254 passed；4 个 unhandled error 系 StreamProxyFormWizard scrollIntoView 存量 jsdom 噪音——该域本变更零接触，git status 证实）
- [x] 11.3 类型检查：`npx vue-tsc -b` 通过（0 error）；ESLint 本环境缺 `@eslint/js` 无法运行（存量环境问题，commit 时 lint-staged 兜底；三 lane 各自 grep 确认生产代码无 as any/@ts-ignore）
- [x] 11.4 后端回归：`uv run pytest -k "database or migration or maintenance"` 全绿（197 passed / 7 skipped；PG 冒烟不触发——本变更未触及 schema/写库路径，仅进程内状态与响应文本）
- [x] 11.5 test 集群实测（节点可用）：真实发起一次 SQLite→test 库迁移，验收确认弹窗、G8 禁用、进度、失败/成功历史行展开、断开实时进度文案、503 全局横幅（迁移中在集群页触发写操作）、就地切换与重启指引；全程截图留档（E2E Playwright 15/15 通过——确认弹窗/G8 预选禁用/真实迁移 22 表成功/历史展开/就地切换弹窗取消/断开文案/900px 无溢出全过；503 出口文案实测捕获（run5）；全局横幅与横幅页写反馈由组件级 7+15 用例覆盖（微库秒级完成锁窗口未捕获，SKIP 备案）；备份期断开→「迁移中断」如实入账已按双真实终态断言）
- [x] 11.6 更新用户手册迁移章节截图与文案（manual-screenshots 产线，输出入库需 `git add -f`，#8）（第 19 章文案全量重写为新交互；18/19 章 8 张截图重制——含确认弹窗/两栏+风险面板/进行中态(路由拦截 mock)/结果条/历史展开/详情抽屉/清理弹窗）
- [x] 11.7 `openspec validate --all` 0 error 收口（196 passed / 0 failed）；按 #53 归档流程合并 delta 至主 specs（实施完成后执行）
