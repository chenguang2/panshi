## Context

当前节点管理功能嵌入在集群详情页（ClusterDetail.vue）的 Tab 中，通过 `useClusterNodes.ts` composable 管理。每个集群独立加载节点列表，缺少全局视图。运维人员需要同时查看和管理多个集群的节点，当前设计要求先进入集群详情再切换到节点 Tab，操作路径长。

项目中已有 Node 模型、Node CRUD schema、cluster_nodes.py API（集群作用域）以及 nodes.py（简单的 IP+端口查找）。前端已有 `useClusterNodes.ts` composable 提供了完整的节点操作能力（启动/停止/状态查询/编辑/删除/数据库对比）及执行结果 Drawer 组件（NodeExecutionResultDrawer.vue）。

## Goals / Non-Goals

**Goals:**
- 新增独立的 NodeList.vue 页面，展示所有集群的全部节点
- 后端 `GET /nodes` 扩展为全局节点列表 API，支持分页、搜索、集群筛选、状态筛选、排序
- 操作列包含：详情、启动、停止、状态查询（主按钮），更多菜单含编辑、删除、数据库对比
- 集群筛选下拉框默认"全部集群"
- 增加状态筛选下拉框：全部状态 / 运行中 / 已停止
- 搜索框同时搜索 IP 和名称
- 添加节点表单包含"所属集群"下拉框
- 编辑节点不可修改所属集群
- 权限模型沿用跨集群 API 模式，非管理员只看到有权限集群的节点
- Nginx 列替换为 Edge版本（从 status_detail 中的 statistic.edge_version 获取）
- 去掉心跳时间列

**Non-Goals:**
- 不修改现有的集群详情页节点 Tab（保持向后兼容）
- 不修改 cluster_nodes.py 现有 API（保持向后兼容）
- 不涉及节点批量操作（批量操作保留在集群详情页）
- 不涉及节点配置同步/发布（保留在集群详情页）

## Decisions

### 1. 后端：扩展 `GET /nodes` 而非复制 cluster_nodes.py

**决策**：在现有 `backend/app/api/v1/nodes.py` 中扩展 `GET /nodes` 为完整列表 API，返回所有集群的节点列表，含 cluster_name。

**理由**：
- 避免重复的数据库查询和分页逻辑
- `cluster_nodes.py` 已有 `/clusters/{cluster_id}/nodes` 保持集群作用域不变
- 独立 `nodes.py` 作为全局节点 API 入口是清晰的职责分离

**权限**：全局节点列表 API 需增加 `get_current_user` 认证依赖，非管理员用户通过 `UserCluster` 过滤只能看到自己有权限的集群的节点。与其他跨集群 API（`upstreams.py`、`routes.py`）行为一致。

**响应格式**：
```json
{
  "total": 100,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 1,
      "cluster_id": 1,
      "cluster_name": "生产集群",
      "ip": "10.0.0.1",
      "service_port": 80,
      "management_port": 9180,
      "edge_path": "/usr/local/edge",
      "status": 1,
      "status_detail": { "statistic": { "edge_version": "2.5.0" } },
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 2. 前端：独立 NodeList.vue + 复用 useClusterNodes 逻辑

**决策**：新建独立页面 NodeList.vue，复用 `useClusterNodes.ts` 中的节点操作能力（启动/停止/状态查询），但重新实现列表展示（全局列表而非集群作用域）。

**理由**：
- `useClusterNodes.ts` 中的节点操作（`startNode`、`stopNode`、`queryNodeStatus`）和 Drawer 状态管理是完整的，可以复用
- 全局列表与集群详情页列表的数据流不同（全局列表一次加载所有节点，而非按集群加载），需要独立实现
- 复制必要的操作函数而非直接复用 composable，避免对现有集群详情页的副作用

### 3. 前端：使用 Ant Design Vue Table 组件

**决策**：使用 `<a-table>` 组件（与 ConfigDiff 等页面一致），而非使用原生 `<table>`。

**理由**：
- 与项目现有 UI 组件库（Ant Design Vue）一致
- 内置分页、排序、筛选支持
- 设计稿中的表格结构（IP、集群、端口、状态、操作）用 a-table 列定义更清晰

### 4. 前端：数据库对比使用 ConfigDiffDrawer/现有方式

**决策**：数据库对比操作直接导航到现有 ConfigDiff 组件，传入 cluster_id 和 node_id。

**理由**：
- 已有 `ConfigDiff.vue` 组件支持配置对比功能
- 从全局节点页面触发时，直接用 drawer 展示对比结果

### 6. 详情 Modal

**决策**：操作列增加「详情」按钮，点击弹出详情 Modal，展示节点属性（IP、集群、端口、Edge路径、状态、创建时间）以及该节点所在集群的统计卡片（路由数、上游数、插件数、全局规则数）。

**数据来源**：
- 节点属性：从 `NodeResponse` 直接获取
- 集群统计：调用 `GET /clusters/{cluster_id}/stats` 获取

### 7. 状态筛选

**决策**：在搜索框旁增加状态筛选下拉框，选项为「全部状态 / 运行中 / 已停止」，对应 Node 的 `status` 字段（1=运行中 / 0=已停止）。

### 8. 搜索范围

**决策**：搜索框同时搜索 IP 和名称两个字段，与现有 `cluster_nodes.py` 的 `NODE_ALLOWED_SEARCH_FIELDS` 一致。

### 5. Edge版本展示

**决策**：从 `Node.status_detail.statistic.edge_version` 字段获取 Edge 版本信息。若无可展示（显示"-"）。

**理由**：
- `edge_statistic` 操作返回的统计信息中包含 `edge_version` 字段
- 只有执行过状态查询的节点才有此数据，没有数据时优雅降级

## Risks / Trade-offs

- **[性能]** 全局节点列表在节点数很大时（1000+）可能查询较慢 → 后端分页 + 前端分页，默认每页20条
- **[数据一致]** `status_detail` 中的 Edge 版本仅在执行过状态查询后才有 → 前端显示"-"作为默认值
- **[向后兼容]** 扩展 `GET /nodes` 可能影响现有调用方 → 当前只有 EdgeImport 中的 `find_node` 使用此接口，且使用 ip+management_port 参数；`GET /nodes?ip=...&management_port=...` 仍保持原有查找功能不变。新增的分页/搜索/筛选功能通过新增可选参数实现，不改变已有行为
- **[删除操作]** 全局页面删除节点需确认集群上下文 → 删除时 Modal 展示集群信息供确认
- **[权限过滤]** 非管理员用户通过 `UserCluster` 过滤后看到的节点数可能远少于实际总数 → 前端显示的总数 `total` 已经是过滤后的结果，与分页一致
