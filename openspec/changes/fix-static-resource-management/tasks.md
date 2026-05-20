## 1. 后端模型与数据库

- [ ] 1.1 定义 `StaticResource` SQLAlchemy 模型（id, route_id, current_version, created_at, updated_at）
- [ ] 1.2 定义 `StaticResourceVersion` SQLAlchemy 模型（id, resource_id, version, file_path, file_size, publish_result, created_at）
- [ ] 1.3 定义 Pydantic Schema（创建/更新/响应）
- [ ] 1.4 创建数据库迁移

## 2. 后端 API

- [ ] 2.1 `POST /clusters/{id}/static_resources` — 上传 zip + 关联路由
- [ ] 2.2 `GET /clusters/{id}/static_resources` — 列表
- [ ] 2.3 `DELETE /clusters/{id}/static_resources/{resource_id}` — 删除（支持仅删数据库/同时删 Edge）
- [ ] 2.4 `POST /clusters/{id}/static_resources/{resource_id}/publish` — 发布到 Edge 节点
- [ ] 2.5 `GET /clusters/{id}/static_resources/{resource_id}/versions` — 版本列表
- [ ] 2.6 `POST /clusters/{id}/static_resources/{resource_id}/rollback` — 回滚到指定版本

## 3. 前端

- [ ] 3.1 集群管理页新增"静态资源" Tab
- [ ] 3.2 卡片列表展示（路由路径、路由 ID、版本、大小、状态）
- [ ] 3.3 上传弹窗（选择路由、上传 zip、校验插件和路径格式）
- [ ] 3.4 发布弹窗（选择节点、进度日志展示）
- [ ] 3.5 删除弹窗（选项：仅删数据库/同时删 Edge）
- [ ] 3.6 版本管理弹窗（版本列表、回滚）

## 4. Edge 节点对接

- [ ] 4.1 确认 Edge 节点 `/edge/panshi/admin_static_resources` PUT handler 就绪
- [ ] 4.2 后端 EdgeClient 新增 `upload_static_resource` 和 `delete_static_resource` 方法
