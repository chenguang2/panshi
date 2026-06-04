## Why

上游管理目前只能在集群管理页面内作为子 tab 操作，缺少独立的上游列表主页。设计稿 `docs/ui/Live-Artifact-4/upstreams.html` 提供了独立的上游管理页面，包含集群筛选、负载均衡算法筛选、搜索、表格展示、分页、操作菜单等功能。

## What Changes

- **新增页面** `frontend/src/views/UpstreamList.vue` — 独立的上游管理主页
- **侧边栏** 在「核心功能」区增加「上游管理」菜单项，指向 `/upstreams`
- **路由** 新增 `/upstreams` 路由
- **筛选栏**：集群筛选下拉框 + 负载均衡算法筛选 + 搜索框 + 计数
- **表格列**：名称/描述、所属集群、负载均衡算法、目标节点、协议、版本、创建时间、操作
- **新建上游**：复用 `ClusterUpstreams.vue` 逻辑，额外加「所属集群」字段
- **操作菜单**（下拉）：编辑、发布、版本管理、删除（无回滚）
- **编辑**：复用集群管理中编辑上游逻辑，额外加「所属集群」
- **删除**：复用集群管理中删除上游逻辑
- **发布**：复用集群管理中上游发布逻辑
- **版本管理**：复用集群管理中的上游版本管理功能

## Capabilities

### New

- `upstream-management`（单独页面的上游管理能力）

## Impact

- `frontend/src/views/UpstreamList.vue` — 新增
- `frontend/src/router/index.ts` — 新增路由
- `frontend/src/components/AppSidebar.vue` — 新增菜单项
- 复用 `ClusterUpstreams.vue` 中的 add/edit/delete/publish/version 逻辑
