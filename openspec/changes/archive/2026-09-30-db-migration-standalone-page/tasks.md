# 任务：数据迁移独立页面（抽组件 + 独立页 + 摘要卡）

> 约定：纯前端结构重构，后端零改动；每步 vitest + `vue-tsc -b` 可独立合入；TDD（规则 #16）——组件测试先行；mock 形状取自真实响应（规则 #43）；不改锁语义/SSE 格式（约定 #31/#32/#45）。

## 1. 抽取迁移组件（行为零变化）

- [x] 1.1 RED：`DatabaseManagement.test.ts` 现有迁移段断言盘点（迁移表单/进度/running-tasks 恢复），迁移到 `DbMigrationCard` 组件用例（挂载/发起/SSE 进度/防二次启动）
- [x] 1.2 GREEN：迁移整段抽为 `components/DbMigrationCard.vue`（模板+script+样式随迁；**历史管理含清理预览/清理执行、静态资源语境提示一并随段**；连接列表经 props 传入，不建 store）；DatabaseManagement 原位引用替换，页面行为零变化
- [x] 1.3 `npx vitest run` + `npx vue-tsc -b` 全绿（此步可独立提交）

## 2. 独立页面与导航

- [x] 2.1 `views/DbMigrationPage.vue` 页面壳（PageHeader + DbMigrationCard，对齐 BackupManagement.vue 模式；根元素不设 padding——memory #99）+ 路由 `/db-migration`（系统管理分类、数据库管理旁）
- [x] 2.2 菜单项 + navMeta 搜索注册 + 前端权限 keys（`database_management` 沿用）双端核对（后端无新端点，安全守卫采样无需变更——rule #19）
- [x] 2.3 vitest 页面壳用例（权限渲染/路由可达）

## 3. 数据库管理摘要卡

- [x] 3.1 RED：`DbMigrationSummaryCard` 组件用例（active 连接展示、最近一次迁移结果、进行中状态、入口=纯导航不触发迁移、挂载单次拉取不轮询、无权限整卡不渲染；mock 形状 curl 实测——rule #43）
- [x] 3.2 GREEN：`components/DbMigrationSummaryCard.vue`（对齐 DbBackupSummaryCard 模式；挂载时单次轻量状态拉取，不新增常驻轮询）+ DatabaseManagement 迁移段替换为摘要卡
- [x] 3.3 `DatabaseManagement.vue` 体量回落核对（**拆后 ≤ 900 行**，迁移 UI 不再内联）+ vitest + vue-tsc

## 4. 回归与文档

- [x] 4.1 e2e database-management spec 按新结构核对（必要时更新选择器/路径）；手动链路验证：迁移页发起 → 断连重进恢复进度 → 摘要卡状态；**空态验证（可用连接不足 2 个时发起禁用）**
- [x] 4.2 前端全量 vitest + `vue-tsc -b`
- [x] 4.3 主 specs 同步（`db-migration-page` 能力合并入库，归档时执行）
