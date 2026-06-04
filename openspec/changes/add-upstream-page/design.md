## Context

设计稿 `docs/ui/Live-Artifact-4/upstreams.html` 展示独立上游管理页面，包含：
- 页面标题 + 集群筛选下拉 + 新建按钮
- 搜索栏 + 负载均衡算法筛选
- 表格（名称/集群/算法/目标节点/协议/版本/时间/操作）
- 操作下拉菜单（编辑/发布/版本管理/删除）
- 新建/编辑 Modal（含所属集群字段）
- 分页

## Page Layout

```
┌──────────────────────────────────────────────────────────────┐
│  PageHeader: 上游管理                                         │
│  管理后端上游服务，配置负载均衡和目标节点                       │
│  [全部集群 ▼]  [+ 新建上游]                                   │
├──────────────────────────────────────────────────────────────┤
│  Filter Bar: [🔍 搜索...]  [全部算法 ▼]  共 N 个上游          │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Table: □ 名称     集群   算法   目标节点  协议  版本  时间 ││
│  │       □ user-svc 生产  轮询   10.0.0.1  http  v5  01-15  ││
│  │       □ order-svc 生产  轮询   ...       http  v3  02-10  ││
│  │                          ⋮                                ││
│  └──────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────┤
│  第 1 页，共 1 页                   [1] [2] [3] ...          │
└──────────────────────────────────────────────────────────────┘
```

## Key Decisions

| 决策 | 选择 | 理由 |
|---|---|---|
| 框架 | 独立页面 + Modal 表单 | 与设计稿一致 |
| 表格 | Ant Design `<a-table>` | 复用现有项目模式 |
| 操作菜单 | Ant Design `<a-dropdown>` | 复用现有模式 |
| 表单 | Ant Design `<a-modal>` + `<a-form>` | 与设计稿 modal 结构一致 |
| 数据复用 | 从现有 API 获取 | 复用 `clusters.py` 后端接口 |
| 集群筛选 | 从 `GET /clusters` 获取集群列表 | 现有接口 |
| 跨集群上游列表 | 新增 `GET /api/v1/upstreams` 后端接口 | 避免前端逐个查集群合并 |
| 所属集群字段 | 新建时可选，编辑时只读 | 防止上游迁移集群引发路由引用问题 |
| 弹窗复用 | 提取共享组件 | 提取上游表单Modal/发布Modal/版本管理Modal到 components/ |

## Backend Change

### 新增 `GET /api/v1/upstreams`

返回跨集群的上游列表，支持分页、搜索、按集群和算法筛选。

**权限逻辑：**
- admin → 返回全部上游
- 普通用户 → 只返回该用户有权限的集群（`UserCluster`）下的上游

**参数：**
- `cluster_id`（可选）— 按集群筛选
- `load_balance`（可选）— 按算法筛选
- `search`（可选）— 按名称/描述搜索
- `page`, `pageSize`（可选）— 分页

**返回格式与现有的 `GET /clusters/{cluster_id}/upstreams` 一致。**

## Shared Components

从 `ClusterUpstreams.vue` 中提取以下组件到 `frontend/src/components/`：

- `UpstreamFormModal.vue` — 新建/编辑上游的表单弹窗（含所属集群字段）
- `UpstreamPublishModal.vue` — 发布上游的节点选择弹窗
- 版本管理复用现有的 `VersionManagementModal.vue`

提取后 `ClusterUpstreams.vue` 改为引用这些共享组件，`UpstreamList.vue` 也引用同一套。

## Reuse from ClusterUpstreams.vue

以下功能直接从 `ClusterUpstreams.vue` 的 composable (`useClusterUpstreams.ts`) 或 inline 逻辑中复用：

- `addUpstream` / `editUpstream` — 修改：增加 cluster_id 字段
- `deleteUpstream` — 直接复用
- `publishUpstream` — 直接复用
- `openUpstreamVersionManagement` — 直接复用
- API 调用路径：`GET /clusters/{id}/upstreams`、`POST/PUT/DELETE` 等

## Differences from Design

- 设计稿有「回滚」操作菜单项 → **去掉**（按需求）
- 设计稿没有「版本管理」菜单项 → **增加**（按需求，复用集群管理中的版本管理功能）
