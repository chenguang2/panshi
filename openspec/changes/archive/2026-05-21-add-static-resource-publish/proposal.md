## Why

用户需要在 Edge 网关上托管静态前端站点（HTML/JS/CSS 压缩包），并能通过可配置的 URL 路径直接访问。例如上传一个 Vue 构建产物 zip，配置路径 `/static/myapp/` 后即可通过 `http://gateway/static/myapp/` 访问。

## What Changes

- **后端新增 StaticResource 模型和 CRUD API**：管理静态资源元数据（名称、URL 路径、文件大小、版本）
- **后端新增静态资源发布流程**：上传 zip → 解压 → 通过 Admin API 分发到所有活跃 Edge 节点
- **后端新增 Edge 节点通信端点**：扩展 EdgeClient，支持向 Edge 节点传输静态资源文件
- **Edge 节点侧新增 Admin API**：`PUT /edge/panshi/admin_static_resources?edge_uuid={uuid}`，接收原始 zip 二进制（不加密），在节点本地解压存储
- **Edge 节点侧新增 PANSHI Lua 插件 `static_resource`**：在 access 阶段匹配路由，从本地文件系统读取文件返回，含缓存控制（ETag、Cache-Control、304 条件请求）
- **前端集群管理页新增"静态资源" Tab**：上传 zip、配置路径、查看发布状态
- **前端新增版本管理支持**：沿用现有 ConfigVersion 记录发布历史

## Capabilities

### New Capabilities

- `static-resource-management`: 静态资源的上传、配置、版本管理和发布
- `static-resource-serving`: Edge 节点侧通过 PANSHI 插件提供静态文件访问，含缓存控制和 MIME 类型处理

### Modified Capabilities

<!-- 不涉及现有 spec 的需求变更 -->

## Impact

- 后端：新增 `backend/app/models/` 模型、`backend/app/api/v1/` 路由、`backend/app/services/edge_client.py` 扩展
- Edge 节点：新增 1 个 Admin API handler（Lua），新增 1 个 PANSHI 插件（Lua）
- 前端：新增静态资源管理 Tab，复用版本管理弹窗组件
- 无新外部依赖
