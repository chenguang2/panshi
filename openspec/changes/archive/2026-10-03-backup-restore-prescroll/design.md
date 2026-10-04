# Design: backup-restore-prescroll

## Context

预选在 `handleList` 内 `selected.value = preselectPackageName`；包列表容器在步骤 2 的 `v-else` 分支上，`listing=true` 期间不挂载——列包返回后立即滚动会查不到节点。测试侧 VTU 挂载在离屏树，`document.querySelector` 拿不到元素，必须经组件 ref 定位。

## Decisions

- **D1 三层时序**：`preselectHit` 标志在 try 内置位（作用域提升到函数体，不能困在 try/finally 内）；`finally` 置 `listing=false` 触发容器挂载后，`await nextTick()` 再滚动；滚动语句放在 try 块之外（不参与错误提示语义）。
- **D2 容器内查询 + 可选链守卫**：`listRef.value?.querySelector('.dbw-pkg.selected')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })`——jsdom 无 `scrollIntoView`，可选链保证单测环境不炸；测试以 `Element.prototype` spy 断言调用次数与参数，finally 还原原型。
- **D3 未命中不滚动**：`preselectPackageName` 未命中（或未传入）时 `preselectHit` 为 false，不触发滚动——与既有「未命中时不选中」行为一致，不引入额外视觉噪音。

## Risks / Trade-offs

- 平滑滚动（`behavior: 'smooth'`）在低端浏览器可能退化为瞬时跳转，属可接受降级；`block: 'center'` 保证长列表中选中行可见且上下文对称。
