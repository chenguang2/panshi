## Why

Edge 网关支持 HTTP 和 Stream（L4 TCP/UDP）两种代理模式。当前管理平台仅覆盖 HTTP 模式（上游、路由、插件组等），用户管理 Stream 代理需直接操作 Edge 节点。本次新增四层代理管理功能，让用户通过界面即可完成 Stream 代理的创建、配置、发布和版本管理，无需手动操作节点。

## What Changes

- 新增数据库表 `ps_stream_proxy`，存储四层代理配置
- 新增后端 API 路由 `/clusters/{id}/stream-proxies`（CRUD + 发布 + 版本管理 + 回滚）
- 新增前端独立页面"四层代理"，卡片式列表展示所有 Stream 代理
- 两步创建向导：选择集群/节点 → 检测可用端口 → 配置上游目标
- 端口可用性检测：从远程节点读取 `edge.env`，解析 `deploy.stream.edge.listen` 获取可用端口，查询已用端口标记占用
- 复用现有版本管理（`ConfigVersion`）和发布流程（`PublishConfirmModal` + `executePublish`）
- 新增 `stream_proxy` feature flag，通过 `features.yaml` 控制菜单和路由注册
- 与 HTTP API 代码完全分离，不干扰现有功能

## Capabilities

### New Capabilities
- `stream-proxy-management`: 四层代理的 CRUD、发布、版本管理、删除等完整生命周期管理
- `stream-proxy-port-detection`: 从远程节点 edge.env 中检测可用 Stream 端口，并标记已占用端口

### Modified Capabilities
*（无现有能力变更）*

## Impact

- **后端**: 新增 model `StreamProxy`（`ps_stream_proxy` 表）、schemas、cluster-scoped API routes、EdgeClient stream 路由发布方法
- **前端**: 新增页面 `StreamProxyList.vue`、composable `useClusterStreamProxies.ts`、向导组件；路由注册 + 侧边栏菜单 + feature flag
- **依赖**: 无新增外部依赖
- **Edge 交互**: 通过现有 EdgeClient 调用 Stream 管理接口（`/stream/edge/admin/routes`）
