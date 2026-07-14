## 1. 后端 — 数据模型

- [x] 1.1 创建 `backend/app/models/ssl.py` — SSL 证书 ORM 模型（`ps_ssl_certificate` 表）
- [x] 1.2 创建 `backend/app/schemas/ssl.py` — SSL 证书 Pydantic 模型
- [x] 1.3 模型注册：在 `backend/app/models/__init__.py` 导出

## 2. 后端 — EdgeClient SSL 支持

- [x] 2.1 `backend/app/services/edge_client.py` 的 `RESOURCE_PATHS` 中添加 `"ssl": "/edge/admin/ssl"`

## 3. 后端 — SSL 证书 API

- [x] 3.1 创建 `backend/app/api/v1/cluster_ssl.py` — SSL 证书 CRUD + 发布 + 版本历史 API
- [x] 3.2 发布时自动生成 `edge_uuid`（UUID），复用 `create_config_version` 记录版本
- [x] 3.3 在 `backend/app/api/v1/__init__.py` 注册 ssl router

## 5. 前端 — SSL 证书页面

- [x] 5.1 创建 `frontend/src/types/ssl.ts` — TypeScript 类型定义
- [x] 5.2 创建 `frontend/src/api/ssl.ts` — API 客户端
- [x] 5.3 创建 `frontend/src/views/SslList.vue` — 证书列表页（卡片网格）
- [x] 5.4 创建 `frontend/src/components/SslFormDrawer.vue` — 上传/编辑证书 Drawer（支持文件上传 + 文本粘贴）
- [x] 5.5 `frontend/src/router/index.ts` — 添加 `/ssl` 路由
- [x] 5.6 `frontend/src/components/AppSidebar.vue` — 侧边栏菜单
- [x] 5.7 `VersionManagementModal.vue` — 支持 `resource_type="ssl"`

## 6. 验证

- [x] 6.1 Python 测试通过（7/7 SSL 测试通过）
- [x] 6.2 TypeScript 编译通过
