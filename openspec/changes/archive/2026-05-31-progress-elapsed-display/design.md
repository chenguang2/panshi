## Context

当前 `executeNodeAction` 和 `queryNodeStatus` 中进度值变化只有几个固定节点（5% → 20% → 60% → 100%），API 调用耗时 6-15s 期间进度完全不变。用户无法区分「正在执行」和「卡死了」。

## Decisions

1. **脉冲定时器** — `setInterval` 每 2s +5%，上限分别设为 55%（executeNodeAction）和 65%（queryNodeStatus），API 返回后停掉定时器跳到最终值
2. **秒数计时器** — `setInterval` 每秒 +1，从操作开始到结束持续累加
3. **组件化数据流** — `execElapsed` 作为 `ref` 从 composable 导出，经 ClusterNodes.vue 绑定到 Drawer 组件的 props
