## 1. 后端跨集群 API

- [x] 1.1 新建 `backend/app/api/v1/plugin_metadata.py`：`GET /plugin-metadata`（搜索+集群筛选+分页+权限），返回 plugin_name、cluster_name、current_version、config_data 等
- [x] 1.2 在 `backend/app/api/v1/__init__.py` 注册 `plugin_metadata.router`

## 2. 前端页面

- [x] 2.1 重写 `frontend/src/views/PluginMetadataList.vue`：PageHeader + 搜索 + 集群筛选 + 卡片网格 + 分页
- [x] 2.2 编写单元测试：页面渲染、API 调用、搜索、筛选
- [x] 2.3 编辑弹窗（使用 PluginEditorDrawer 内联实现）
- [x] 2.4 新建弹窗（内联 Modal + 集群/插件选择）

## 3. 操作功能

- [x] 3.1 实现：查看（Drawer 显示详情）
- [x] 3.2 实现：编辑（调用 PUT API）
- [x] 3.3 实现：新建（调用 POST API）
- [x] 3.4 实现：删除（showDeleteConfirm + executeDeleteWithProgress）
- [x] 3.5 实现：发布（PublishConfirmModal + executePublish）
- [x] 3.6 实现：版本管理（VersionManagementModal）

## 4. 验证

- [x] 4.1 前端测试全部通过
- [x] 4.2 前端构建通过
