## 1. 节点选择默认状态变更

- [x] 1.1 `showDeleteConfirm()` 中 `selectedNodeIds` 初始值从全量节点改为空集（`useClusterUtils.ts` 第25行）
- [x] 1.2 验证"Edge 节点"勾选时节点列表显示正常，所有节点 checkbox 默认不选

## 2. 集群删除重构为 showDeleteConfirm + executeDeleteWithProgress 模式

- [x] 2.1 `deleteCluster()` 重写为与路由删除一致的代码模式：`showDeleteConfirm`（第一界面选范围+节点）→ `Modal.confirm`（第二界面名称验证）→ `executeDeleteWithProgress`（进度弹窗）
- [x] 2.2 导入 `executeDeleteWithProgress`，移除内联进度逻辑

## 3. 验证

- [x] 3.1 LSP 诊断通过，无类型错误
- [x] 3.2 前端构建通过
