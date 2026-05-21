## Context

当前管理系统支持 upstream、route、plugin_config、global_rule、plugin_metadata 五种资源类型，均遵循 Model → Schema → API → 前端 Tab 的模式。资源通过 EdgeClient（SM4 加密 HTTP）推送到基于 OpenResty 的 Edge 节点集群。静态资源发布采用 raw_put 直连，不经过 SM4 加密。

Edge 节点已有自定义 Lua 插件框架（data_center、pre_functions、proxy_rewrite 等），可以通过新增 Admin API handler 和 APISIX 插件来扩展能力。

## Goals / Non-Goals

**Goals:**
- 用户能够上传 zip 压缩包并配置 URL 访问路径
- Edge 节点从本地文件系统直接响应静态文件请求
- 文件变更通过现有的"发布到全部活跃节点"流程分发
- 支持 ETag/304 条件请求和 Content-Type 推断

**Non-Goals:**
- 不实现增量文件更新（每次重新上传完整 zip）
- 不引入对象存储或 CDN 等外部依赖
- 不改变现有路由/上游等资源的管理方式

## Decisions

1. **文件存储于 Edge 节点本地文件系统** — zip 解压到各 Edge 节点磁盘，不走数据库。数据库只存元数据。
2. **文件传输使用 raw_put 直连，不加密** — 新增 Admin API 端点 `PUT /edge/panshi/admin_static_resources?edge_uuid={uuid}`，zip 内容作为原始二进制传输，不经过 SM4 加密，仅使用 X-API-KEY 认证。
3. **APISIX 插件方式（非 Nginx 注入）** — 不需要 reload，完全在 APISIX 请求生命周期内处理。
4. **缓存控制内置于插件中** — 约 30 行 Lua 代码实现 ETag + Cache-Control + 304，避免引入外部依赖。
5. **复用现有发布流程** — 版本递增、ConfigVersion 记录、节点同步结果展示与 upstream/route 一致。
6. **发布时不创建路由** — 静态资源发布仅发送 zip 文件到 Edge 节点，路由需事先配置好并加载 `static_resource` 插件。

## Risks / Trade-offs

- [大文件内存占用] 插件用 `file:read("*all")` 加载大文件到内存 → 对 >10MB 的文件改用 `ngx.print` 分块读取，或限制单文件大小
- [多节点文件一致性] 文件通过管理平台分发，极端情况下可能部分节点失败 → 沿用现有的 `results` 回报机制，在管理界面展示每个节点的同步状态
- [Edge 节点磁盘空间] 多次上传迭代可能导致旧文件残留 → 发布时先删除旧目录再解压新文件
- [Content-Type 覆盖不全] MIME 映射表可能遗漏某些扩展名 → 默认回退为 `application/octet-stream`
