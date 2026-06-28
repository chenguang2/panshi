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
- **THEN** the response SHALL contain grouped comparisons for upstreams, routes, plugin_configs, global_rules, plugin_metadata, and stream_proxies
- **THEN** each group SHALL list items with status: `match`, `mismatch`, `only_in_db`, or `only_in_edge`
- **THEN** mismatched items SHALL include field-level differences
- **THEN** route comparison SHALL include `vars` (advanced match), `plugin_config_ids`, and per-plugin `plugins`
- **THEN** plugin metadata SHALL be keyed by plugin name from the Edge node key path

#### Scenario: 四层代理对比结果纳入配置对比API
- **WHEN** 发送 `GET /clusters/{cluster_id}/nodes/{node_id}/diff`
- **THEN** 响应中的 groups SHALL 包含 `stream_proxies` 分组
- **AND** 该分组 SHALL 与其他资源使用相同的对比状态（match/mismatch/only_in_db/only_in_edge）

#### Scenario: 对比四层代理的负载均衡算法
- **WHEN** 四层代理的 DB 配置使用 `weighted_roundrobin`
- **AND** Edge 节点使用 `roundrobin`
- **THEN** 对比结果 SHALL 为 `match`（两者语义等效）

#### Scenario: 对比四层代理的 targets
- **WHEN** DB 的 targets 为 JSON 数组 `[{"target":"10.0.0.1:3306","weight":100}]`
- **AND** Edge 节点的 `upstream.nodes` 为 dict 格式 `{"10.0.0.1:3306": 100}`
- **THEN** 对比结果 SHALL 正确识别为 `match` 或列出差异字段

#### Scenario: stream route 配置在 upstream 嵌套对象中
- **WHEN** 从 Edge 拉取 stream route 数据
- **THEN** `load_balance` SHALL 从 `upstream.type` 读取
- **AND** `scheme` SHALL 从 `upstream.scheme` 读取
- **AND** `timeout` / `keepalive_pool` SHALL 从 `upstream.timeout` / `upstream.keepalive_pool` 读取
- **AND** `listen_port` SHALL 从顶层 `server_port` 读取

#### Scenario: 检测仅存在于 Edge 的四层代理
- **WHEN** Edge 节点上有 stream route 但 DB 中无对应 edge_uuid 的记录
- **THEN** 对比结果 SHALL 将其标记为 `only_in_edge`
- **AND** 使用 stream route 的 name 或 listen_port 作为显示名称

### Requirement: EdgeClient can list all configs

The system SHALL use existing EdgeClient `list_upstreams`, `list_routes`, `list_plugin_configs`, `list_global_rules`, `list_plugin_metadata`, and `list_stream_routes` methods to fetch Edge node configurations.

#### Scenario: EdgeClient list methods return parseable data
- **WHEN** `list_upstreams()` is called
- **THEN** it SHALL return a list of upstream config dicts

#### Scenario: list_stream_routes 不可用时不影响其他资源
- **WHEN** Edge 节点不支持 `/stream/edge/admin/routes` 端点
- **THEN** `list_stream_routes()` 的异常 SHALL 被独立捕获
- **AND** 其他资源（upstreams/routes/plugin_configs 等）的对比 SHALL 不受影响
- **AND** 四层代理分组 SHALL 不出现或仅显示 `only_in_db` 项

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

#### Scenario: 四层代理分组显示在对比 Drawer 中
- **WHEN** 前端打开配置对比 Drawer 且后端返回了 `stream_proxies` 分组
- **THEN** Drawer SHALL 显示"四层代理"分组，包含该分组的所有对比项
- **AND** 分组折叠/展开、差异高亮等功能 SHALL 与其他资源一致
- **AND** 四层代理的字段标签 SHALL 使用中文显示

#### Scenario: 四层代理字段标签映射
- **WHEN** 前端渲染四层代理的字段级差异
- **THEN** 以下字段 SHALL 有中文标签：
  - `listen_port` → "监听端口"
  - `load_balance` → "负载均衡"
  - `scheme` → "协议"
  - `targets` → "目标节点"
  - `timeout` → "超时配置"
  - `keepalive_pool` → "连接池"
  - `remote_addr` → "CIDR 范围"
  - `sni` → "TLS SNI"

### Requirement: Equivalence rules reduce false mismatches

The system SHALL use the EquivalenceRules engine to normalize DB and Edge values before comparison, reducing false mismatch reports caused by missing defaults.

#### Scenario: load_balance field is properly mapped
- **WHEN** DB upstream has `load_balance="weighted_roundrobin"` and Edge has `type="roundrobin"`
- **THEN** they SHALL be considered equivalent (not shown as mismatch)

#### Scenario: DB comma strings match Edge arrays
- **WHEN** DB stores `methods="GET,POST"` and Edge stores `methods=["GET","POST"]`
- **THEN** they SHALL be considered equivalent
