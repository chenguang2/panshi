# openresty-version-selector Specification

## Purpose

安装 OpenResty 前弹出文件选择对话框，用户选择版本后触发安装流程。

## Requirements

### Requirement: 安装 OpenResty 前弹出文件选择对话框
用户点击"安装 OpenResty"后，系统 SHALL 弹出选择对话框，从后端拉取可选安装包列表，用户选择后确认安装。

#### Scenario: 弹出选择对话框
- **WHEN** 用户点击"安装 OpenResty"菜单项
- **THEN** 系统 SHALL 发送 `GET /clusters/{cluster_id}/nodes/openresty-files` 获取文件列表
- **AND** 弹出模态对话框，标题为"选择 OpenResty 安装包"
- **AND** 对话框 SHALL 显示节点 IP 和安装路径
- **AND** 对话框 SHALL 以列表形式展示可选安装包（含文件名、大小、修改时间）
- **AND** 默认选中第一个文件
- **AND** 对话框底部有"取消"和"开始安装"两个按钮

#### Scenario: 选择安装包并开始安装
- **WHEN** 用户选择了一个安装包并点击"开始安装"
- **THEN** 系统 SHALL 发送 `POST /clusters/{cluster_id}/nodes/{node_id}/install-openresty`
- **AND** 请求体 SHALL 包含 `prefix` 和 `openresty_file`（`srcpath` 和 `destpath` 由后端自动计算）
- **AND** 后续走现有 SSE 流式安装流程

#### Scenario: 文件列表为空时提示
- **WHEN** `GET /clusters/{cluster_id}/nodes/openresty-files` 返回空列表
- **THEN** 对话框 SHALL 显示"未找到 OpenResty 安装包"提示
- **AND** "开始安装"按钮 SHALL 禁用

#### Scenario: 网络请求失败
- **WHEN** 获取文件列表接口请求失败
- **THEN** 对话框 SHALL 显示错误提示
- **AND** 用户可关闭对话框重试

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
