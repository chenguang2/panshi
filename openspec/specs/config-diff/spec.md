## Purpose

数据库与 Edge 节点配置对比功能，提供差异检测和同步验证。
## Requirements
### Requirement: 插件元数据为空配置时正确判断存在性

`_compare_plugin_metadata` SHALL 使用 `edge_data is None` 而非 `not edge_data` 来判断 Edge 上是否存在插件元数据，避免空配置 `{}` 被误判为"edge 中不存在"。

#### Scenario: 空配置不被误判为 only_in_db
- **WHEN** 数据库中存在 `data_center` 插件元数据且 `config_data='{}'`
- **AND** Edge 节点存在对应的 `data_center` 元数据且值为 `{}`
- **THEN** 对比结果 SHALL 为 `match`（当两者都为空时）或 `diff`（当内容不一致时）
- **AND** 不 SHALL 返回 `only_in_db`

## ADDED Requirements

### Requirement: Backend provides config diff API

The system SHALL provide a `GET /clusters/{cluster_id}/nodes/{node_id}/diff` endpoint that compares database configuration against a specific Edge node's running configuration.

#### Scenario: API returns structured diff results
- **WHEN** a GET request is sent to `/clusters/{cluster_id}/nodes/{node_id}/diff`
- **THEN** the response SHALL contain grouped comparisons for upstreams, routes, plugin_configs, global_rules, and plugin_metadata
- **THEN** each group SHALL list items with status: `match`, `mismatch`, `only_in_db`, or `only_in_edge`
- **THEN** mismatched items SHALL include field-level differences
- **THEN** route comparison SHALL include `vars` (advanced match), `plugin_config_ids`, and per-plugin `plugins`
- **THEN** plugin metadata SHALL be keyed by plugin name from the Edge node key path

### Requirement: EdgeClient can list all configs

The system SHALL use existing EdgeClient `list_upstreams`, `list_routes`, `list_plugin_configs`, `list_global_rules`, and `list_plugin_metadata` methods to fetch Edge node configurations.

#### Scenario: EdgeClient list methods return parseable data
- **WHEN** `list_upstreams()` is called
- **THEN** it SHALL return a list of upstream config dicts

### Requirement: Frontend shows diff in Drawer

The system SHALL provide a Drawer panel on the cluster list page showing configuration comparison, with field-level differences expanded inline below each mismatched row.

#### Scenario: Mismatched items expand inline
- **WHEN** the user clicks "查看差异" on a mismatched row
- **THEN** the field-level comparison SHALL expand directly below that row
- **THEN** expanding another row SHALL NOT affect previously expanded rows

#### Scenario: Mismatched fields are highlighted
- **WHEN** a field value differs between DB and Edge
- **THEN** the differing value SHALL be highlighted in red/with a diff marker

### Requirement: Node operations include diff button

The system SHALL add a "数据库对比" button to each node's operation column in the cluster list.

#### Scenario: Button opens diff drawer
- **WHEN** the user clicks "数据库对比" on a node
- **THEN** a Drawer panel SHALL open on the right side of the cluster list page
- **THEN** the Drawer SHALL show configuration comparison for that node

### Requirement: Equivalence rules reduce false mismatches

The system SHALL use the EquivalenceRules engine to normalize DB and Edge values before comparison, reducing false mismatch reports caused by missing defaults.

#### Scenario: load_balance field is properly mapped
- **WHEN** DB upstream has `load_balance="weighted_roundrobin"` and Edge has `type="roundrobin"`
- **THEN** they SHALL be considered equivalent (not shown as mismatch)

#### Scenario: DB comma strings match Edge arrays
- **WHEN** DB stores `methods="GET,POST"` and Edge stores `methods=["GET","POST"]`
- **THEN** they SHALL be considered equivalent
