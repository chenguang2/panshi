# Tasks

## 1. 守卫先行（RED）

- [x] 1.1 `mockupParity.source.test.ts` mig 段补触达红线：历史表含 `:expand-row-by-click="true"` 与自定义 `:expand-icon`（chevron 指示器）、失败胶囊含 `:title`（translateMigrationError 复用）——运行确认对现状 RED
- [x] 1.2 `DbMigrationHistoryCard.test.ts`：失败行状态胶囊 `title` 含中文转译原因（如「连接被拒绝」）、成功行胶囊无 title；展开区按钮点击后展开态保持（rc-table 冒泡探测）——确认 RED

## 2. 实施（GREEN）

- [x] 2.1 `DbMigrationHistoryCard.vue`：`:expand-row-by-click="true"` + `:expand-icon` chevron 纯指示渲染（muted/hover accent/展开 rotate 180°，无独立 click）；失败胶囊 `:title="translateMigrationError(record.error_message)"`（仅失败行）；若 1.2 冒泡探测失败则展开区容器加 `@click.stop`
- [x] 2.2 设计页正式稿修订：历史表样张加 chevron 触发列（52px，min-width 1033）、失败胶囊 `title` 注记；退役文件 `db-migration-hist-expand-variants.html` 删除（裁决留痕 = 本变更 design.md 裁决记录节）
- [x] 2.3 验证 1.1/1.2 转绿

## 3. 回归收口

- [x] 3.1 `npx vue-tsc -b`；迁移域前端 9 文件定向全绿；全量 vitest（漂移按 #58 定性）
- [x] 3.2 真机复核：行点击展开/收起与 chevron 旋转、hover accent；失败行悬停见原因；展开区复制/详情按钮行为不受行点击影响
