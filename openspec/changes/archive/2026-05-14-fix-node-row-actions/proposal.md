## Why

集群节点页面的节点表格中，每行"更多"下拉菜单里的"编辑"和"删除"操作依赖当前选中行（勾选）来确定操作对象，而不是操作菜单所在的行。用户期望点击某行的菜单就对该行操作，不受当前选中哪一行的干扰。

## What Changes

- 节点表格"更多"菜单中的"编辑"和"删除"改为直接操作当前行记录，不再依赖 `cluster.selectedNode`
- `editNode` 和 `deleteNode` 函数增加可选 `node` 参数，优先使用传入的行记录，无传入时回退到选中行（兼容顶部工具栏按钮）

## Capabilities

### New Capabilities

- `node-row-actions`: 节点表格行内操作（编辑/删除）直接使用当前行数据，不依赖行选中状态

### Modified Capabilities

<!-- 无，不涉及 spec 级别的行为变更 -->

## Impact

仅修改 `ClusterList.vue` 一个文件中的三处函数调用和定义，无 API、依赖或系统级影响。
