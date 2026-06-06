## 1. Backend: Add plugin_metadata_count to ClusterResponse

- [x] 1.1 `backend/app/schemas/cluster.py` — ClusterResponse 增加 `plugin_metadata_count: int = 0` 字段
- [x] 1.2 `backend/app/api/v1/clusters.py` — 集群列表查询（`list_clusters` 和 `list_my_clusters`）中增加 `PluginMetadata` 的 SELECT COUNT 计数

## 2. Frontend: Implement new ClusterList.vue

- [x] 2.1 Create the full ClusterList.vue template with:
  - Page header: title "集群管理", description, "新建集群" button
  - Filter bar: search input, group name dropdown, cluster count
  - Responsive card grid with group headers
  - Cluster cards with header (display name + group name + status), description, 7-category stats, node tags, action buttons (详情/编辑/测试 + dropdown 删除)
- [x] 2.2 Implement script logic:
  - Fetch cluster list from `GET /api/v1/clusters` (or `/my`)
  - Group clusters by `group_name` with computed property
  - Filter by search text and group selection
  - Cluster add/edit modal CRUD
  - Test connectivity handler
  - Delete cluster with confirmation
- [x] 2.3 Implement scoped CSS:
  - Card grid layout with responsive breakpoints
  - Card styling with header, stats bar, node tags, actions
  - Group headers, filter bar
  - Status dots and badges

## 3. Update default cluster modal handling

- [x] 3.1 Ensure form validation and submission for cluster add/edit works
- [x] 3.2 Ensure the modal has inline group name creation (input at bottom of select dropdown)
