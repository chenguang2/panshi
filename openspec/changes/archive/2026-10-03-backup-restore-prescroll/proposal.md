# Proposal: backup-restore-prescroll

## Why

恢复向导支持从「历史记录」点「恢复此包」带入预选（M8/5.4：列包成功且预选命中时自动选中，用户从校验步骤继续）。但当备份包较多时，选中行可能落在列表视口之外——界面呈现的列表没有任何高亮行，用户误以为预选失效/没选中（2026-10-03 实测反馈「看不见已选中」）。预选机制的可发现性在长列表场景下断裂。

## What Changes

- 列包成功且预选命中时，待列表容器挂载（`listing=false`，步骤 2 的 `v-else` 分支挂载 `.dbw-pkg-list`）后 `nextTick` 在容器 ref 内查 `.dbw-pkg.selected` 并 `scrollIntoView({ block: 'center', behavior: 'smooth' })` 居中平滑滚动。
- 实现细节的三点约束：滚动必须在挂载后的下一拍执行（`listing=true` 时容器不在 DOM）；查询限定在容器 ref 内（VTU 离屏树下 document 级查询拿不到元素）；`scrollIntoView` 走可选链守卫（jsdom 无此 API，测试以 spy 断言）。
- `docs/user-manual/20-backup-management.md` 20 章口径补半句（预选命中自动滚动到选中行）。

## Capabilities

### Modified

- `sqlite-backup-restore`：「向导流程体验与状态呈现」补「预选命中后自动滚动到选中行」场景

## Impact

- 前端：`frontend/src/components/DbBackupRestoreWizard.vue`（listRef 容器 ref + preselectHit 标志 + nextTick 滚动）
- 测试：`frontend/src/components/__tests__/DbBackupRestoreWizard.ux.test.ts`（新增 spy 用例：scrollIntoView 以 `{block:'center',behavior:'smooth'}` 调用一次；wizard+card 59/59 全绿）
- 文档：`docs/user-manual/20-backup-management.md`
- 风险：极低——纯 UX 增强，无接口/数据变化；未命中预选时不触发滚动，行为与旧版一致
