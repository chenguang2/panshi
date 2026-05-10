# Edge Client Debug - Specification

## ADDED Requirements

### Requirement: Node Selection

The system SHALL provide a dropdown to select an edge node from available clusters. The dropdown SHALL display all active nodes (status=1) from all clusters with their IP and management port.

#### Scenario: Display available nodes
- **WHEN** user navigates to `/edge-client` page
- **THEN** system SHALL fetch all active nodes from all clusters
- **AND** display them in a dropdown with format "cluster_name (ip:port)"

#### Scenario: Select node and load data
- **WHEN** user selects a node from dropdown
- **THEN** system SHALL automatically fetch upstreams, routes, and plugins from that node
- **AND** display them in their respective tabs

### Requirement: Upstream Management

The system SHALL allow users to view, create, update, and delete upstreams on the selected edge node.

#### Scenario: List upstreams
- **WHEN** user has selected an edge node
- **AND** clicks on "Upstreams" tab
- **THEN** system SHALL fetch all upstreams from `/edge/admin/upstreams`
- **AND** display them in a table with columns: ID, Name, Type, Nodes, Actions

**Upstream Table Row Structure:**
```
| ID (UUID) | Name | Type | Nodes Count | Edit Btn | Delete Btn |
```

**Response Parsing:**
- `node.nodes[]` contains array of {host, port, weight}
- Display node count as `len(nodes)`
- Display node summary as "host1:port1, host2:port2..."

#### Scenario: Create new upstream
- **WHEN** user clicks "Add Upstream" button
- **THEN** system SHALL display a modal with fields:
  - Name (text input, optional)
  - Type (dropdown: roundrobin, chash, ewma, least_conn)
  - Nodes (key-value list: host:port -> weight)
- **AND** when user submits, system SHALL POST to `/edge/admin/upstreams`
- **AND** upon success, refresh the upstream list

#### Scenario: Edit upstream
- **WHEN** user clicks "Edit" on an upstream row
- **THEN** system SHALL display a modal pre-filled with upstream data
- **AND** when user submits, system SHALL PUT to `/edge/admin/upstreams/{id}`
- **AND** upon success, refresh the upstream list

#### Scenario: Delete upstream
- **WHEN** user clicks "Delete" on an upstream row
- **THEN** system SHALL show a confirmation dialog:
  - Title: "确认删除 Upstream"
  - Content: "确定要删除 Upstream {name} 吗？此操作直接作用于 Edge 服务器，绕过正常同步流程。"
- **AND** if user confirms, system SHALL DELETE to `/edge/admin/upstreams/{id}`
- **AND** upon success, refresh the upstream list

### Requirement: Route Management

The system SHALL allow users to view, create, update, and delete routes on the selected edge node.

#### Scenario: List routes
- **WHEN** user has selected an edge node
- **AND** clicks on "Routes" tab
- **THEN** system SHALL fetch all routes from `/edge/admin/routes`
- **AND** display them in a table with columns: ID, Name, URI, Methods, Upstream, Actions

**Route Table Row Structure:**
```
| ID (UUID) | Name | URI | Methods (tags) | Upstream ID | Edit Btn | Delete Btn |
```

**Response Parsing:**
- `node.nodes[]` contains array of route objects
- Each route has `value.id` (UUID), `value.name`, `value.uri`, `value.methods[]`, `value.upstream_id`

#### Scenario: Create new route
- **WHEN** user clicks "Add Route" button
- **THEN** system SHALL display a modal with fields:
  - Name (text input, optional)
  - URI (text input, required)
  - Methods (multi-select: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, CONNECT, TRACE)
  - Hosts (text input, optional, comma-separated)
  - Priority (number input, default 0)
  - Upstream ID (text input or dropdown from available upstreams)
  - Plugins (JSON editor, optional)
- **AND** when user submits, system SHALL POST to `/edge/admin/routes`
- **AND** upon success, refresh the route list

#### Scenario: Edit route
- **WHEN** user clicks "Edit" on a route row
- **THEN** system SHALL display a modal pre-filled with route data
- **AND** when user submits, system SHALL PUT to `/edge/admin/routes/{uuid}`
- **AND** upon success, refresh the route list

#### Scenario: Delete route
- **WHEN** user clicks "Delete" on a route row
- **THEN** system SHALL show a confirmation dialog:
  - Title: "确认删除 Route"
  - Content: "确定要删除 Route {name} (ID: {uuid}) 吗？此操作直接作用于 Edge 服务器，绕过正常同步流程。"
- **AND** if user confirms, system SHALL DELETE to `/edge/admin/routes/{uuid}`
- **AND** upon success, refresh the route list

### Requirement: Plugin Display

The system SHALL allow users to view available plugins and plugin metadata on the selected edge node.

#### Scenario: List available plugins
- **WHEN** user has selected an edge node
- **AND** clicks on "插件列表" tab
- **THEN** system SHALL fetch all available plugin names from `/edge/admin/plugins/list`
- **AND** display them in a table with columns: 序号, 插件名称

#### Scenario: List plugin metadata
- **WHEN** user has selected an edge node
- **AND** clicks on "插件数据" tab
- **THEN** system SHALL fetch all plugin metadata from `/edge/admin/plugin_metadata`
- **AND** display them in a table with columns: 插件名称, 配置, 操作

#### Scenario: Create/Edit plugin metadata
- **WHEN** user clicks "添加插件数据" or "编辑" on a plugin metadata row
- **THEN** system SHALL display a modal with fields: 插件名称, 配置数据 (JSON)
- **AND** when user submits, system SHALL PUT to `/edge/admin/plugin_metadata/{plugin_name}`
- **AND** upon success, refresh the plugin metadata list

#### Scenario: Delete plugin metadata
- **WHEN** user clicks "删除" on a plugin metadata row
- **THEN** system SHALL show a confirmation dialog
- **AND** if user confirms, system SHALL DELETE to `/edge/admin/plugin_metadata/{plugin_name}`
- **AND** upon success, refresh the plugin metadata list

#### Scenario: Reload plugins
- **WHEN** user clicks "重新加载" button in plugin metadata tab
- **THEN** system SHALL call PUT to `/edge/admin/plugins/reload`
- **AND** upon success, show success message

### Requirement: Debug Warning

The system SHALL display a clear warning that this page is for debugging purposes and operations bypass the normal publish workflow.

#### Scenario: Display warning banner
- **WHEN** user navigates to `/edge-client` page
- **THEN** system SHALL display a warning banner at the top with:
  - Icon: ⚠️
  - Text: "Debug Mode - Operations here bypass normal sync workflow"
  - Background color: orange/yellow
  - Position: Fixed at top of page content

### Requirement: Global Rules Management

The system SHALL allow users to view, create, update, and delete global rules on the selected edge node.

#### Scenario: List global rules
- **WHEN** user has selected an edge node
- **AND** clicks on "全局规则" tab
- **THEN** system SHALL fetch all global rules from `/edge/admin/global_rules`
- **AND** display them in a table with columns: ID, 描述, 插件数, 操作

#### Scenario: Create/Update global rule
- **WHEN** user clicks "添加规则" or "编辑" on a global rule row
- **THEN** system SHALL display a modal with fields: 规则ID, 描述, 插件配置 (JSON)
- **AND** when user submits, system SHALL PUT/PATCH to `/edge/admin/global_rules/{id}`

#### Scenario: Delete global rule
- **WHEN** user clicks "删除" on a global rule row
- **THEN** system SHALL show a confirmation dialog
- **AND** if user confirms, system SHALL DELETE to `/edge/admin/global_rules/{id}`

### Requirement: Plugin Configs Management

The system SHALL allow users to view, create, update, and delete plugin configs on the selected edge node.

#### Scenario: List plugin configs
- **WHEN** user has selected an edge node
- **AND** clicks on "插件组" tab
- **THEN** system SHALL fetch all plugin configs from `/edge/admin/plugin_configs`
- **AND** display them in a table with columns: ID, 描述, 插件数, Labels, Hosts, 操作

#### Scenario: Create/Update plugin config
- **WHEN** user clicks "添加插件组" or "编辑" on a plugin config row
- **THEN** system SHALL display a modal with fields: 配置ID, 描述, 插件配置 (JSON), Labels (JSON), Hosts (JSON)

### Requirement: Auto-Load Data

The system SHALL pre-load all tab data when a node is selected for optimal tab switching experience.

#### Scenario: Pre-load all data on node selection
- **WHEN** user selects an edge node (either by cluster auto-select or manual input)
- **THEN** system SHALL fetch data for all 6 tabs in parallel
- **AND** display loading state until all data is loaded

#### Scenario: Instant tab switching
- **WHEN** user switches between tabs
- **THEN** system SHALL instantly display the tab content (no loading delay since data is pre-loaded)

#### Scenario: Refresh all data
- **WHEN** user clicks the refresh button
- **THEN** system SHALL re-fetch data for all 6 tabs in parallel

## UI Layout Specification

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚠️ Debug Mode - Operations here bypass normal sync workflow   [✕]   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Cluster: [pc-cluster ▼]   Node: [192.168.100.235:11999 ▼]  [🔄]   │
│                                                                        │
│  ┌─────────────┬──────────┬───────────┐                                 │
│  │  Upstreams  │  Routes  │  Plugins  │  ← Tab bar                  │
│  └─────────────┴──────────┴───────────┘                                 │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ ID              │ Name      │ Type       │ Nodes    │ Actions   │ │
│  ├──────────────────────────────────────────────────────────────────┤ │
│  │ 431253674958... │ U-811X    │ roundrobin │ 4 nodes  │ [✏️] [🔥] │ │
│  │ 433437599709... │ U-812X    │ roundrobin │ 4 nodes  │ [✏️] [🔥] │ │
│  │ 431260450521... │ R-proxy   │ -          │ -        │ [✏️] [🔥] │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  [+ Add Upstream]   [+ Add Route]                                     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Modal: Create/Edit Upstream

```
┌─────────────────────────────────────────┐
│ Create Upstream                      [✕]│
├─────────────────────────────────────────┤
│ Name:        [________________]         │
│ Type:        [roundrobin ▼]            │
│                                         │
│ Nodes:                                   │
│ ┌─────────────────┬───────┬────────┐   │
│ │ Host:Port       │ Weight│ Action │   │
│ ├─────────────────┼───────┼────────┤   │
│ │ 127.0.0.1:1980  │  1    │  [🔥]  │   │
│ │ [+ Add Node]                    │   │
│ └───────────────────────────────────┘   │
│                                         │
│          [Cancel]    [Submit]          │
└─────────────────────────────────────────┘
```

### Modal: Create/Edit Route

```
┌─────────────────────────────────────────┐
│ Create Route                         [✕]│
├─────────────────────────────────────────┤
│ Name:     [________________]           │
│ URI:      [/api/*___________]          │
│ Methods:  [GET, POST         ▼]       │
│ Hosts:    [example.com_____] (optional) │
│ Priority: [0___________]               │
│ Upstream: [431253674958...▼]            │
│                                         │
│ Plugins (JSON):                         │
│ ┌─────────────────────────────────┐    │
│ │ {                                 │    │
│ │   "proxy_rewrite": {             │    │
│ │     "regex_uri": [...]           │    │
│ │   }                               │    │
│ │ }                                 │    │
│ └─────────────────────────────────┘    │
│                                         │
│          [Cancel]    [Submit]          │
└─────────────────────────────────────────┘
```

## Technical Notes

### Edge API Response Structure

**Upstream List Response:**
```json
{
  "count": 4,
  "action": "get",
  "node": {
    "dir": true,
    "nodes": [{
      "key": "/edge/upstreams/{id}",
      "value": {
        "id": "431253674958783373",
        "type": "roundrobin",
        "name": "U-811X",
        "nodes": {"127.0.0.1:8111": 1, "127.0.0.1:8112": 1},
        ...
      }
    }]
  }
}
```

**Route List Response:**
```json
{
  "count": 2,
  "action": "get",
  "node": {
    "dir": true,
    "nodes": [{
      "key": "/edge/routes/{uuid}",
      "value": {
        "id": "431260450521351053",
        "uri": "/proxy/*",
        "methods": ["GET", "POST"],
        "plugins": {...},
        "upstream_id": "431253674958783373",
        "name": "R-proxy",
        "status": 1
      }
    }]
  }
}
```

### Backend API Proxy

Panshi Admin backend proxies these requests with encryption:
- All request bodies encrypted with SM4
- All response bodies decrypted
- API key header added automatically