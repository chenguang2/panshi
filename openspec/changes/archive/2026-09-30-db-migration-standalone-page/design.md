## Context

`DatabaseManagement.vue`（1632 行）内联迁移整段 UI：迁移进行中横幅 + `running-tasks` 进度恢复、源/目标选择与迁移模式流卡、SSE 进度（`migrateDatabaseStream`）、迁移历史。迁移端点（后端 `api/v1/database.py`）挂 `database_management` 权限，本次**零后端改动**。「备份与容灾」拆分（db-backup-multi-target 5.x）已验证「独立页壳 + 大组件 + 摘要卡」模式，本次照抄。

## Goals / Non-Goals

- Goals：DatabaseManagement 回归连接注册表单一职责（体量显著回落）；迁移获得独立页面与护栏信息空间；交互行为与拆分前完全一致
- Non-Goals：不改后端端点/权限键/锁语义/SSE 事件格式（约定 #31/#32/#45 分歧不动，以实现为准）；不做迁移历史服务端分页改造；不动 ClusterBackupDialog（集群备份走自己的入口）

## Decisions

- **D1 组件抽取**：迁移执行 UI 整体抽为 `frontend/src/components/DbMigrationCard.vue`（模板 + script + 样式随迁），独立页 `views/DbMigrationPage.vue` = PageHeader 壳 + 该组件（对齐 BackupManagement.vue 31 行壳模式）。DatabaseManagement 引用摘要卡 `DbMigrationSummaryCard.vue`（对齐 DbBackupSummaryCard 模式：四格统计口径换成 active 连接/最近一次迁移/进行中状态）。
- **D2 路由与导航**：`/db-migration`（系统管理分类、数据库管理旁）；菜单项、navMeta 搜索注册、前端权限 keys（`database_management` 沿用，不新增键）三处同步注册。
- **D3 状态归属**：迁移进行中状态与 `running-tasks` 轮询随组件走（拆分前逻辑原样搬迁，不改轮询语义）；摘要卡只在页面挂载时拉一次轻量状态，**不新增常驻轮询（进行中状态以打开时为准——已评审确认，与备份摘要卡口径一致）**。
- **D4 共享代码**：连接列表/名称解析经 props/现有 api 模块传入组件，不建 store、不复制实现（规则 #7/#24 精神：单一实现）。
- **D5 边界与护栏随段迁移**（2026-09-30 评审确认）：迁移历史管理（清理预览/清理执行）、静态资源语境提示、空态处理（可用连接不足 2 个 → 禁用发起并提示）均属迁移段，随 `DbMigrationCard.vue` 迁入独立页；摘要卡入口为纯导航，不触发迁移。
- **D6 测试**：组件测试随迁（DatabaseManagement.test.ts 迁移段断言拆为 DbMigrationCard 用例 + 摘要卡用例）；e2e database-management spec 按新结构核对；安全守卫采样无需变更（无新端点）。

## Risks / Trade-offs

- 迁移期间用户停留在旧入口（数据库管理摘要卡）发起的流程改为跳页，多一跳——接受（低频高危操作，跳页换取护栏信息空间）
- 抽组件时容易漏搬响应式状态/监听器——以「拆分前后行为一致」为验收线，vitest 组件测试先行（TDD，规则 #16）
- 摘要卡非实时：同页停留期间他人发起迁移不可见（重进页面即刷新）——接受，与备份摘要卡口径一致

## Migration Plan

1. 先抽 `DbMigrationCard.vue`（DatabaseManagement 内引用替换，行为零变化，独立可测）
2. 再建独立页 + 路由/菜单/摘要卡替换
3. 每步 `npx vitest run` + `vue-tsc -b` 可独立合入

## Acceptance

- `DatabaseManagement.vue` 拆后体量 **≤ 900 行**（迁移执行 UI 不再内联）
- 迁移页功能全集与拆分前对账无缺失（表单/SSE 进度/running-tasks 恢复/历史管理含清理/护栏提示）
- vitest + `vue-tsc -b` 全绿；e2e 相关 spec 通过

## Open Questions

- 无（路由 `/db-migration`、菜单「数据迁移」已定）
