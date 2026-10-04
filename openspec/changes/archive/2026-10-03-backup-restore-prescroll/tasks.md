# Tasks: backup-restore-prescroll

> 追溯性建档：代码已合入（00f4b197），以下为实际执行记录（前端 TDD）。

## 1. 组 1 — 预选命中后滚动到选中行

- [x] 1.1 （RED）`DbBackupRestoreWizard.ux.test.ts` 新增 spy 用例：4 包列表预选最后一个 → `rows[3]` 带选中态 + `scrollIntoView` 以 `{ block: 'center', behavior: 'smooth' }` 恰好调用一次；`finally` 还原 `Element.prototype`
- [x] 1.2 （GREEN）`DbBackupRestoreWizard.vue`：`.dbw-pkg-list` 挂 `listRef` 容器 ref；`handleList` 内 `preselectHit` 置位（作用域提升出 try 块）；`listing=false` 后 `nextTick` 在容器内查 `.dbw-pkg.selected` 并 `scrollIntoView` 居中平滑滚动（可选链守卫，jsdom 兼容）
- [x] 1.3 途中修正三层时序：VTU 离屏树改容器 ref 内查询；滚动移出 try 块；标志位作用域提升
- [x] 1.4 回归：wizard+card 59/59 vitest 全绿；`npx vue-tsc -b` 干净

## 2. 组 2 — 文档

- [x] 2.1 `docs/user-manual/20-backup-management.md` 20 章口径补半句（预选命中自动滚动到选中行）
