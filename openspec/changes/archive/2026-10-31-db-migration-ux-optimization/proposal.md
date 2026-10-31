# DB Migration UX Optimization

## Why

数据迁移模块 UX 评审（2026-10-31，代码级核查 18 项问题，5 项高危）发现：迁移这类「清空目标库」级高危操作点击即执行、无确认弹窗；G8 约束（禁止迁入活动库）只在提交后以 400 暴露；迁移失败原因与备份路径接口已返回但界面不展示，排障需查库；「终止迁移」按钮只断开浏览器进度流却提示「已终止」，与 5 秒后恢复的「迁移进行中」横幅自相矛盾；数据库管理页全部写操作无错误捕获，迁移锁 503 等后端明确原因静默无反馈。上述缺陷直接损害数据安全感知与排障效率。

## What Changes

- **P0 迁移发起高危确认**：移除「我了解将清空目标库」勾选框 + 点击直发，改为确认弹窗（源/目标标识与地址、目标库将被清空覆盖警告、自动备份源库及保留最近 10 份说明、写锁影响、超时摘要；空目标库文案降级）
- **P0 G8 约束前置**：目标下拉禁用当前活动库并标注「当前活动库，不可作为目标」（后端 400 保留为最终防线）；当前活动库默认预选为源
- **P0 迁移失败原因可见**：迁移历史表增加行展开，展示 `error_message`（失败分类中文转译）与 `backup_path`（等宽字体 + 复制）
- **P0 终止语义诚实化**（用户决策 2026-10-31）：按钮改「断开实时进度」，文案如实说明迁移仍在后台执行、写锁保持至结束；移除永不命中的「已取消」状态映射；真取消留待未来变更
- **P1 迁移页状态带**：页头下新增当前活动库 / 待重启生效 / 迁移锁进行中状态条
- **P1 全局迁移锁横幅**：App 层横幅（由 503 锁响应联动拉起，非轮询），503 错误文案出口化（含源 → 目标与「进度见数据迁移页」指引）；`maintenance.started_at` 修正为 naive UTC（对齐约定 #26，修复 +8h 显示偏移）
- **P1 两栏布局与风险面板**：迁移卡横排 7 元素改两栏（流向表单 + 固定风险说明面板），消除窄屏溢出；移除卡片内重复 h3 标题（与 PageHeader 双标题）
- **P1 空态闭环**：「可用连接不足」附「去新建连接」直达数据库管理页新建弹窗
- **P1 连接表单校验与错误反馈**：PG 必填字段（主机/数据库名）客户端校验前置；DatabaseManagement 全部写操作补错误捕获与中文反馈（503 锁 / 422 / 400 / 网络错误分类上屏）
- **P1 迁移完成就地切换**：「去切换数据库」在本页弹出共享切换确认弹窗（`SwitchConnectionModal`，两页复用），切换成功即时展示重启指引横幅，不再只做页面跳转
- **规格修正（随代码实据裁决）**：`migration-progress-stream` 的「断连 → 协作式取消」与代码现状（断连不取消、后台继续）相悖，本次修订对齐；`database-management` 直连流式迁移需求内部矛盾（场景 1「先备份目标库」vs 场景 6「备份源库」）按代码实据（`db_archive_service.export_archive(source, …)`）统一为源库

## Capabilities

### New Capabilities

（无——全部为既有 capability 的需求修订，不引入新 capability 路径）

### Modified Capabilities

- `db-migration-page`：独立页承载高危确认弹窗、G8 前置禁用与源预选、状态带、就地切换、空态闭环；替换模式由下拉选项改为危险标签明示
- `migration-progress-stream`：断连与主动断开语义诚实化（裁决规格-代码漂移）；失败/超时提示可理解（原因分类 + 处理建议）
- `database-management`：连接表单必填校验前置与写操作错误反馈全覆盖；切换成功即时重启指引；迁移确认交互由勾选框改为确认弹窗；替换模式备份对象口径修正为源库
- `db-running-tasks-ui`：新增全局迁移锁横幅需求（503 联动、锁文案出口化、锁开始时间 UTC 正确）

## Impact

- **前端**：`frontend/src/components/DbMigrationCard.vue`（确认弹窗、G8 前置、两栏布局、历史行展开、断开语义、移除双标题）、`frontend/src/views/DbMigrationPage.vue`（状态带、就地切换）、`frontend/src/views/DatabaseManagement.vue`（错误捕获、必填校验、切换弹窗抽换共享组件）、`frontend/src/api/index.ts`（503 锁识别联动全局横幅）、`frontend/src/components/DbMigrationSummaryCard.vue`（移除「已取消」死映射）；新增 `SwitchConnectionModal`、迁移状态带共享组件
- **后端**：`backend/app/core/maintenance.py`（`started_at` 改 `datetime.utcnow()`；503 detail 文案出口化）；无新增端点、无 schema/模型变更、无权限键变化
- **既有测试**：`DbMigrationCard.test.ts` 勾选框相关用例需随交互改造更新；`tests/` 迁移锁相关用例需断言新 503 文案与 UTC 时间
- **验证链路**：定向 `npx vitest run`（迁移卡/数据库管理）+ `pytest -k "database or migration"`；`openspec validate --all` 收口；开发服务恢复后补三页截图复核视觉层结论（本次评审服务未运行，视觉结论系代码推断）
