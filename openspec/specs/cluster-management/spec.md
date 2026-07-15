## Purpose

Cluster management capabilities for creating, editing, deleting, and monitoring gateway clusters.

## Requirements

### Requirement: Route edit form has method select all

The route edit form SHALL provide a "全选" toggle button for the request methods multi-select.

#### Scenario: Select all methods
- **WHEN** the user clicks "全选"
- **THEN** all 7 HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS) SHALL be selected

#### Scenario: Deselect all methods
- **WHEN** the user clicks "取消全选"
- **THEN** all methods SHALL be deselected

### Requirement: All 6 publish types SHALL use the node-select confirm dialog

The following publish operations SHALL use the unified node-select confirm dialog before execution:
- 上游发布 (`publishUpstream`)
- 路由发布 (`publishRoute`)
- 插件组发布 (`publishPluginConfig`)
- 全局规则发布 (`publishGlobalRule`)
- 静态资源发布 (`publishStaticResource`)
- 插件元数据发布 (`publishPlugin`)

#### Scenario: Upstream publish uses node select
- **WHEN** the user clicks "发布" on an upstream in ClusterList.vue
- **THEN** the node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/upstreams/{upstream_id}/publish` with selected `node_ids`

#### Scenario: Route publish uses node select
- **WHEN** the user clicks "发布" on a route in ClusterList.vue
- **THEN** same node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/routes/{route_id}/publish` with selected `node_ids`

#### Scenario: Plugin config publish uses node select
- **WHEN** the user clicks "发布" on a plugin config in ClusterList.vue
- **THEN** same node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/plugin_configs/{config_id}/publish` with selected `node_ids`

#### Scenario: Global rule publish uses node select
- **WHEN** the user clicks "发布" on a global rule in ClusterList.vue
- **THEN** same node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/global_rules/{rule_id}/publish` with selected `node_ids`

#### Scenario: Static resource publish uses node select
- **WHEN** the user clicks "发布" on a static resource in ClusterList.vue
- **THEN** same node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/static_resources/{sr_id}/publish` with selected `node_ids`

#### Scenario: Plugin metadata publish uses node select
- **WHEN** the user clicks "发布" on a configured plugin in PluginMetadata.vue (formerly GlobalPluginSelector.vue)
- **THEN** same node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/plugin-metadata/{plugin_name}/publish` with selected `node_ids`

### Requirement: 集群资源统计包含四层代理和 SSL

系统 SHALL 在集群统计信息中包含四层代理和 SSL 证书的数量。

#### Scenario: 统计包含四层代理和 SSL
- **WHEN** 调用 `GET /clusters/{cluster_id}/stats`
- **THEN** 返回的 JSON SHALL 包含 `stream_proxies` 和 `ssl_certificates` 字段
- **AND** 值 SHALL 为对应集群下该类型资源的数量

### Requirement: 删除集群清理关联资源

系统 SHALL 在删除集群时清理四层代理和 SSL 证书。

#### Scenario: Edge 侧删除
- **WHEN** 用户选择「从 Edge 节点删除」后确认删除集群
- **THEN** 系统 SHALL 遍历并删除集群下的四层代理和 SSL 证书
- **AND** 删除失败 SHALL NOT 阻塞其他资源的删除

#### Scenario: DB 侧删除
- **WHEN** 用户选择「从数据库删除」后确认删除集群
- **THEN** 系统 SHALL 删除该集群下所有四层代理和 SSL 证书的数据库记录

### Requirement: GlobalPluginSelector SHALL be renamed to PluginMetadata

The component file, CSS class, import, and template tag SHALL be updated to reflect the new name.

#### Scenario: Component file renamed
- **WHEN** inspecting the file system
- **THEN** `GlobalPluginSelector.vue` SHALL be renamed to `PluginMetadata.vue`
- **THEN** the internal CSS class `.global-plugin-selector` SHALL be renamed to `.plugin-metadata`

#### Scenario: All references updated
- **WHEN** inspecting `ClusterList.vue`
- **THEN** `import GlobalPluginSelector from '@/components/GlobalPluginSelector.vue'` SHALL be updated to `import PluginMetadata from '@/components/PluginMetadata.vue'`
- **THEN** `<GlobalPluginSelector :cluster-id="cluster.id" />` SHALL be updated to `<PluginMetadata :cluster-id="cluster.id" />`

### Requirement: 前端删除资源标签

前端 SHALL 在删除确认弹窗的资源列表和删除结果日志中显示四层代理和 SSL 证书的中文标签。

#### Scenario: 显示标签
- **WHEN** 用户点击删除集群弹窗展示资源清单
- **THEN** 列表中 SHALL 显示「四层代理」和「SSL 证书」及其数量
- **WHEN** 删除完成展示结果日志
- **THEN** 日志中 SHALL 显示四层代理和 SSL 证书的删除计数
