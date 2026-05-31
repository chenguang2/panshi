## Context

当前节点启动/停止在 `useClusterNodes.ts` 的 `executeNodeAction` 中直接执行，无确认步骤。结果展示使用 `Modal.info` + `buildDeleteProgressContent`，日志区 `max-height:300px`，Ansible 输出量大时严重不足。

## Goals / Non-Goals

**Goals:**
- 启动/停止操作前弹出确认对话框，标注节点 IP 和操作风险
- 结果展示改用 Drawer（右侧滑出），高度自适应
- 内容分 Tab 展示：关键信息 / stdout / stderr / 命令
- 提供复制日志按钮

**Non-Goals:**
- 不改变后端 API 接口
- 不改变状态查询（statistic）的展示逻辑（同样受益于新 Drawer）
- 不改变删除操作的进度弹窗（保留现有 Modal 实现）

## Decisions

1. **Drawer 替代 Modal** — `a-drawer` 提供更大的展示空间，高度自适应，适合大量文本输出。宽度设为 800px。
2. **Tab 分类** — 使用 `a-tabs` 将输出拆为四类。关键信息 Tab 默认选中，`extractKeyInfo()` 结果放在最前。
3. **组件化** — 新建 `NodeExecutionResultDrawer.vue`，通过 props 接收执行状态数据，`ClusterNodes.vue` 模板中注册。与 `ConfigDiff` 组件的使用模式一致。
4. **确认框** — 复用 `Modal.confirm`（和删除确认风格一致），红色警告，明确标注节点 IP 和操作类型。仅启动/停止需确认，状态查询不需要。

## Risks / Trade-offs

- **[现有 Modal 兼容]** `buildDeleteProgressContent` 仍被发布/删除功能使用 → 不删除，保留现有函数不动
- **[Drawer 无法用 updateContent]** Modal 可以 `modal.update()` 动态刷内容，Drawer 需要用 reactive props 驱动 → 将 logs/progress 提升为 composable 的 reactive 状态
