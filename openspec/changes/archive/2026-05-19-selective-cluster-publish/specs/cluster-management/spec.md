## ADDED Requirements

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
