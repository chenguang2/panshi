# Proposal

## Why

组筛选 select 全站语义二态：老 12 资源页是数据级过滤（`group_name` 服务端过滤），而 2026-11-11 新增组筛选的两个页面（自启动管理、节点任务中心）只收窄集群下拉候选——选了分组列表纹丝不动（自启动页还会清掉集群筛选回到「全部」）。同一位置的同一控件两种行为，违反全站一致性标准；且两页的后端能力不对称：`GET /nodes` 本就支持 `group_name`（前端没传），`GET /node-tasks` 则完全没有该参数。2026-11-12 用户裁决：不做「ClusterSelect 分组头可选」的全站语义变更，修齐这两页对齐数据级语义。

## What Changes

- **自启动管理（EdgeAutostart）**：`loadNodes` 补传 `groupName`（`api/nodes.ts listNodes` 已支持序列化为 `group_name`，后端 `GET /nodes` 已支持）——纯前端一行级接线；选组级联（清集群筛选 + 重载）保持现状。
- **节点任务中心（NodeTaskCenter）**：
  - 后端 `GET /node-tasks`（全局列表端点）新增 `group_name` 查询参数，`_task_list_stmt` 增加分组过滤（复用既有 LEFT JOIN Cluster，语义镜像 `GET /nodes`：具名分组 / `__ung__` / `__all__`）。
  - 前端 `listParams()` 补传 `group_name`；`hasActiveFilters` 纳入分组；URL 深链同步 `group` 参数（对齐既有 `cluster` 深链，详情页返回现场保持一致）。
- **明确不做**：ClusterSelect 分组头不可选语义不变（分组仅用于收窄集群候选）；集群子页任务端点（`/clusters/{id}/node-tasks`）不加 group 参数（集群已唯一确定分组，参数冗余）。

## Capabilities

### New Capabilities

（无——全部为既有能力的修订）

### Modified Capabilities

- `group-filter-on-resource-pages`：页面清单扩展至自启动管理与节点任务中心；钉死两页「选组即数据级过滤」行为与级联重置。
- `group-name-api-filter`：新增需求——`GET /node-tasks` 支持 `group_name`（8 端点族之外的后来者，语义同款；不改既有 8 端点需求标题）。
