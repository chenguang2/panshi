## Why

执行结果 Drawer 中进度条在 API 调用期间卡死在同一个百分比数字，用户无法感知操作仍在进行。缺少已用时间显示，无法判断操作是否异常。

## What Changes

1. **进度脉冲** — API 执行期间每 2 秒自动 +5%，进度条不会长时间静止
2. **已用秒数** — 进度条下方显示「已用 X 秒」，每秒更新
3. **UI 样式** — 已用时间居中显示，字号 14px

## Capabilities

- `execution-progress-timer`: 执行过程中的进度脉冲和已用时间显示

## Impact

- `frontend/src/composables/useClusterNodes.ts`: 添加 startTimers/stopTimers 函数，管理脉冲和计时
- `frontend/src/components/NodeExecutionResultDrawer.vue`: 添加 elapsed prop 和 UI 渲染
- `frontend/src/views/clusters/ClusterNodes.vue`: 绑定 elapsed prop
