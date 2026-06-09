## Why

静态资源上传 ZIP 包后，用户无法查看包内包含哪些文件，只能看到文件大小和版本号。运维和排查问题时需要确认包内文件列表（如 HTML、JS、图片等是否完整），当前只能下载或发布后才可验证，效率低。

## What Changes

- 静态资源卡片新增"查看"按钮，点击后弹出模态框展示 ZIP 包内容列表
- 后端新增 API 端点 `GET /clusters/{cluster_id}/static-resources/{resource_id}/zip-contents`，返回 ZIP 包内文件列表（文件名、文件大小、压缩比、最后修改时间）
- 前端新增 ZIP 内容查看模态框组件

## Capabilities

### New Capabilities
- `static-resource-view-zip`: 查看已上传 ZIP 包的文件列表及其元信息

### Modified Capabilities
- `static-resource-management`: 静态资源管理页面卡片操作区增加"查看"按钮

## Impact

- 后端：`cluster_static_resources.py` 新增一个 GET 端点
- 前端：`StaticResourceList.vue` 新增"查看"按钮及 ZIP 内容展示模态框
- 无数据库变更，新增依赖：无
