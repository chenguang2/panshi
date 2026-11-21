## MODIFIED Requirements

### Requirement: All 6 publish types SHALL use the node-select confirm dialog

The following publish operations SHALL use the unified node-select confirm dialog before execution:
- 上游发布 (`publishUpstream`)
- 路由发布 (`publishRoute`)
- 插件组发布 (`publishPluginConfig`)
- 全局规则发布 (`publishGlobalRule`)
- 静态资源发布 (`publishStaticResource`)
- 插件元数据发布 (`publishPlugin`)

#### Scenario: Upstream publish uses node select
- **WHEN** the user clicks "发布" on an upstream row/card in the upstream resource list (standalone `/upstreams` page or the 统一管理 panel Tab, which renders the same `UpstreamList.vue` in `scopedClusterId` mode)
- **THEN** the node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/upstreams/{upstream_id}/publish` with selected `node_ids`

#### Scenario: Route publish uses node select
- **WHEN** the user clicks "发布" on a route row in the route resource list (standalone `/routes` page or the 统一管理 panel Tab, same `RouteList.vue` in `scopedClusterId` mode)
- **THEN** same node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/routes/{route_id}/publish` with selected `node_ids`

#### Scenario: Plugin config publish uses node select
- **WHEN** the user clicks "发布" on a plugin config card in the plugin config resource list (standalone `/plugin-configs` page or the 统一管理 panel Tab, same `PluginConfigList.vue` in `scopedClusterId` mode)
- **THEN** same node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/plugin_configs/{config_id}/publish` with selected `node_ids`

#### Scenario: Global rule publish uses node select
- **WHEN** the user clicks "发布" on a global rule card in the global rule resource list (standalone `/global-rules` page or the 统一管理 panel Tab, same `GlobalRuleList.vue` in `scopedClusterId` mode)
- **THEN** same node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/global_rules/{rule_id}/publish` with selected `node_ids`

#### Scenario: Static resource publish uses node select
- **WHEN** the user clicks "发布" on a static resource card in the static resource list (standalone `/static-resources` page or the 统一管理 panel Tab, same `StaticResourceList.vue` in `scopedClusterId` mode)
- **THEN** same node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/static_resources/{sr_id}/publish` with selected `node_ids`

#### Scenario: Plugin metadata publish uses node select
- **WHEN** the user clicks "发布" on a configured plugin card in the plugin metadata list (standalone `/plugin-metadata` page or the 统一管理 panel Tab, same `PluginMetadataList.vue` in `scopedClusterId` mode)
- **THEN** same node-select confirm dialog SHALL appear
- **THEN** after selection, calling `POST /clusters/{id}/plugin-metadata/{plugin_name}/publish` with selected `node_ids`

## REMOVED Requirements

### Requirement: GlobalPluginSelector SHALL be renamed to PluginMetadata

**Reason**: 该需求对应的组件 `GlobalPluginSelector.vue` → `PluginMetadata.vue` 两代名字均已在 2026-11-21 的「面板 Tab = 独立页 scoped 单实现」中删除；面板插件元数据 Tab 现直接渲染 `views/PluginMetadataList.vue`（`scopedClusterId` 形态），不存在需要重命名的独立组件。
**Migration**: 阅读面板插件元数据实现时以 `views/PluginMetadataList.vue` 为准；`components/PluginMetadata.vue` 与 `.global-plugin-selector` 类名均已不存在，若在新代码中遇到按实现为准修正。
