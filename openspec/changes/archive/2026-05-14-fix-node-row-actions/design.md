## Context

集群节点页面中，节点表格每行有一个"更多"下拉菜单，包含编辑、删除、启动、停止等操作。当前实现中，编辑和删除操作通过 `editNode(cluster)`、`deleteNode(cluster)` 直接读取 `cluster.selectedNode` 来确定操作对象，而启动、状态等操作则直接使用传入的行记录 `record`。行为不一致导致用户需要先勾选行才能从菜单中编辑/删除，与直觉不符。

## Goals / Non-Goals

**Goals:**
- 节点表格行内"更多"菜单中的"编辑"和"删除"直接操作当前行，不依赖行选中状态
- 顶部工具栏的"编辑"和"删除"按钮继续保持使用选中行

**Non-Goals:**
- 不改变启动、停止、状态查询等其他行内操作的行为（它们已正确使用行记录）
- 不改变上游、路由等其他表格的操作模式（它们已正确实现）

## Decisions

1. **为 `editNode` 和 `deleteNode` 增加可选 `node` 参数**
   - 当通过行内菜单调用时，传入当前行记录；当通过顶部工具栏调用时，不传参数，回退到 `cluster.selectedNode`
   - 这保持了向后兼容，顶部按钮行为不变

2. **`handleNodeAction` 中编辑/删除分支改为传递 `record`**
   - 与启动、停止、状态等操作保持一致的调用模式
   - 与 `handleRouteAction`、`handleUpstreamAction` 的设计一致

## Risks / Trade-offs

无显著风险。改动范围小，仅涉及 `ClusterList.vue` 中三处代码，且顶部工具栏按钮行为不受影响。
