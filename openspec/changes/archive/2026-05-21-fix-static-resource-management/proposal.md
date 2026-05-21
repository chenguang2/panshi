## Why

集群管理页目前缺少静态资源管理功能。用户需要上传前端构建产物（zip 包），关联到已配置了 `static_resource` 插件的路由，并能发布到 Edge 节点、管理版本和回滚。当前只能通过手动调用 Edge API 上传 zip，缺乏可视化的管理界面和版本控制。

## What Changes

- **后端新增 `StaticResource` 模型和 `StaticResourceVersion` 模型**：数据库存储资源与路由的关联关系及版本历史
- **后端新增 CRUD API 和发布 API**：上传 zip、发布到 Edge 节点、版本管理、删除
- **前端集群管理页新增"静态资源"Tab**：卡片列表、上传弹窗、发布弹窗、删除弹窗、版本管理弹窗
- **zip 文件存储在管理端本地文件系统**：`{base}/static/{route_id}/{version}.zip`，数据库只存路径和元数据
- **发布调用 Edge 节点 Admin API**：`PUT /edge/panshi/admin_static_resources`，弹窗选择目标节点
- **删除弹窗**：可选择仅删数据库记录或同时删除 Edge 节点文件

## Capabilities

### New Capabilities
- `cluster-static-resource-upload`: 静态资源上传、路由关联、zip 存储
- `cluster-static-resource-publish`: 发布到 Edge 节点（弹窗选择节点、进度展示）
- `cluster-static-resource-version`: 版本管理（历史查看、回滚）
- `cluster-static-resource-delete`: 删除（数据库 + Edge 节点文件）

## Impact

- 后端：新增模型、Schema、Repository、Service、API 路由
- 前端：集群管理页新增 Tab、卡片列表、上传/发布/删除/版本管理弹窗
- 数据库：新增 `static_resources` 和 `static_resource_versions` 两张表
- Edge 节点：`/edge/panshi/admin_static_resources` 已有 PUT handler，无需改动
