## 1. Edge 节点 Lua 插件

- [ ] 1.1 实现 Admin API handler：接收加密 zip body，解压到 Edge 节点本地目录
- [ ] 1.2 实现 static_resource PANSHI 插件（access 阶段）：文件读取、MIME 类型、缓存控制、304 响应

## 2. 后端 StaticResource 模型与 API

- [ ] 2.1 定义 StaticResource 模型（SQLAlchemy）和 Pydantic Schema
- [ ] 2.2 实现管理端点：CRUD + 上传 zip 并保存到后端临时存储
- [ ] 2.3 实现发布端点：zip 分发到 Edge 节点 + 创建路由 + ConfigVersion 记录
- [ ] 2.4 扩展 EdgeClient：新增 `upload_static_resource` 和 `delete_static_resource` 方法

## 3. 前端静态资源管理 Tab

- [ ] 3.1 在集群管理页新增"静态资源" Tab
- [ ] 3.2 实现静态资源列表、上传表单、发布按钮
- [ ] 3.3 接入版本管理弹窗（复用现有 VersionManagementModal）
