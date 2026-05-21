## Context

集群管理页已有上游、路由、插件组、全局规则、插件元数据五个 Tab，每个都支持 CRUD + 发布到 Edge 节点。缺少静态资源管理功能。

用户需要将前端构建产物（zip）上传到管理端，关联到已配置 `static_resource` 插件的路由，发布到 Edge 节点，并支持版本管理。

已有基础设施：
- Edge 节点已有 `admin_static_resources.lua` handler：`PUT /edge/panshi/admin_static_resources`
- Edge 节点已有 `zip_utils.lua` 解压库
- 后端已有 EdgeClient SM4 加密通信通道

## Goals / Non-Goals

**Goals:**
- 管理端上传 zip → 存本地文件系统 → 数据库记录元数据
- 用户选择路由（单选），从路由 URI 自动关联
- 发布到 Edge 节点（弹窗选择节点，展示进度）
- 卡片形式展示列表，支持版本管理、回滚、删除

**Non-Goals:**
- 不实现增量文件更新（每次全量 zip 重新上传）
- 不直接在管理端解压 zip（解压在 Edge 节点端完成）
- 不实现 CDN 或对象存储集成

## Decisions

1. **文件存管理端本地文件系统** → `{base}/static/{route_id}/{version}.zip`
2. **路由单选** → 一个资源关联一个路由，用 route_id 做目录名
3. **资源名称从路由名称自动获取** → 用户不需要额外输入
4. **卡片列表** → 一行一个卡片，展示路由路径、路由 ID、当前版本、文件大小、更新时间、发布状态
5. **上传校验** → 前端验证 zip 格式（魔数 PK\x03\x04），服务端二次验证
6. **路由校验** → 所选路由必须已加载 `static_resource` 插件，URI 必须以 `*` 结尾
7. **数据库表** → `static_resources`（资源主表）+ `static_resource_versions`（版本表）
8. **版本号** → 从 1 开始递增，每次上传 + 发布生成新版本

## Risks / Trade-offs

- [大文件上传超时] zip 文件可能超过 100MB → 后端设置合适的超时时间，前端显示进度
- [磁盘空间] 多次版本迭代会积累旧 zip 文件 → 删除资源时清理全部版本文件，版本管理支持手动清理旧版本
- [管理端与 Edge 节点文件不一致] 发布过程中网络中断 → 沿用现有 results 机制展示每节点状态，支持重新发布
