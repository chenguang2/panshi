## 1. 定时器逻辑

- [x] 1.1 在 `useClusterNodes.ts` 中添加 `execElapsed` ref 和 `startTimers`/`stopTimers` 函数
- [x] 1.2 在 `executeNodeAction` 中调用 `startTimers(55)` / `stopTimers(60)`
- [x] 1.3 在 `queryNodeStatus` 中调用 `startTimers(65)` / `stopTimers(70)`
- [x] 1.4 在两个 catch 块中调用 `stopTimers(100)`

## 2. UI 展示

- [x] 2.1 `NodeExecutionResultDrawer.vue` 添加 `elapsed` prop
- [x] 2.2 进度条下方渲染 "已用 X 秒"，居中，14px
- [x] 2.3 `ClusterNodes.vue` 绑定 `execElapsed`

## 3. 验证

- [x] 3.1 构建通过
- [x] 3.2 进度条在 API 调用期间自动增长
- [x] 3.3 已用秒数每秒更新
- [x] 3.4 操作完成后计时停止
