## MODIFIED Requirements

### Requirement: 对话框组件可复用
系统 SHALL 提供可复用的 `InstallOpenrestyDialog.vue` 组件，由 `NodeList.vue` 承载；`NodeList.vue` 同时是节点独立页与统一管理面板「集群节点」Tab 的唯一实现（`scopedClusterId` 形态），因此两个入口共用同一安装对话框。

#### Scenario: NodeList 中使用
- **WHEN** 用户在 NodeList 页点击"安装 OpenResty"
- **THEN** SHALL 调用 `InstallOpenrestyDialog` 组件
- **AND** 传入 `node` 对象和 `clusterId`
- **AND** 确认后走 NodeList 的安装流程

#### Scenario: ClusterNodes 中使用
<!-- 2026-11-21：场景标题按 openspec 约定保留（场景名是稳定标识符，不可重命名）；`ClusterNodes.vue` 已删除，改为统一管理面板「集群节点」Tab（同一 NodeList.vue 的 scopedClusterId 形态）。 -->
- **WHEN** 用户在统一管理面板「集群节点」Tab（同一 `NodeList.vue` 的 `scopedClusterId` 形态，原 ClusterNodes.vue 已删除）点击"安装 OpenResty"
- **THEN** SHALL 调用同一 `InstallOpenrestyDialog` 组件
- **AND** 传入 `node` 对象和锁定的 `clusterId`
- **AND** 确认后走同一套安装流程
