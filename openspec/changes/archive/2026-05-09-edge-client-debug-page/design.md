# Edge Client Debug Page - Design

## Context

The system manages multi-cluster gateway configurations. When debugging edge server synchronization issues, developers need direct visibility into what data exists on edge servers (192.168.100.235:11999). Currently, the only way to interact with edge data is through the publish workflow, which doesn't allow viewing or deleting existing configurations.

This debug page provides direct CRUD access to edge server data for development and troubleshooting purposes.

## Goals / Non-Goals

**Goals:**
- Provide UI page at `/edge-client` for direct edge server debugging
- Display all upstreams, routes, and plugins from edge server
- Support Create/Read/Update/Delete operations via edge API
- Allow targeting specific edge nodes by IP:port selection
- Reuse existing authentication and EdgeClient infrastructure

**Non-Goals:**
- This is NOT a replacement for the normal publish workflow
- Not for production use - purely a debug tool
- Does not modify local database - only communicates with edge server
- Not for real-time monitoring - manual refresh only

## Edge API Reference

### Upstream API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/edge/admin/upstreams` | List all upstreams |
| GET | `/edge/admin/upstreams/{id}` | Get single upstream |
| POST | `/edge/admin/upstreams` | Create upstream (ID auto-generated) |
| PUT | `/edge/admin/upstreams/{id}` | Create/Update upstream by ID |
| DELETE | `/edge/admin/upstreams/{id}` | Delete upstream |
| PATCH | `/edge/admin/upstreams/{id}` | Partial update |

**Response Format:**
```json
{
  "count": 4,
  "action": "get",
  "header": {"revision": 37},
  "node": {
    "key": "/edge/upstreams",
    "dir": true,
    "nodes": [
      {
        "key": "/edge/upstreams/{id}",
        "value": {
          "id": "431253674958783373",
          "type": "roundrobin",
          "name": "U-811X",
          "nodes": {"127.0.0.1:8111": 1, "127.0.0.1:8112": 1},
          "pass_host": "pass",
          "scheme": "http",
          ...
        }
      }
    ]
  }
}
```

### Route API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/edge/admin/routes` | List all routes |
| GET | `/edge/admin/routes/{id}` | Get single route (UUID format) |
| POST | `/edge/admin/routes` | Create route (ID auto-generated) |
| PUT | `/edge/admin/routes/{id}` | Create/Update route by ID |
| DELETE | `/edge/admin/routes/{id}` | Delete route |
| PATCH | `/edge/admin/routes/{id}` | Partial update |

**Response Format:**
```json
{
  "count": 4,
  "action": "get",
  "header": {"revision": 12},
  "node": {
    "key": "/edge/routes",
    "dir": true,
    "nodes": [
      {
        "key": "/edge/routes/{uuid}",
        "value": {
          "id": "431260450521351053",
          "uri": "/proxy/*",
          "methods": ["GET", "POST", "PUT", "DELETE"],
          "plugins": {"proxy_rewrite": {"regex_uri": [...]}},
          "status": 1,
          "upstream_id": "431253674958783373",
          "name": "R-proxy",
          "priority": 0
        }
      }
    ]
  }
}
```

## Decisions

### 1. Backend Enhancement - EdgeClient

Add these methods to `EdgeClient`:

```python
# Upstream (existing methods to verify)
get_upstream(upstream_id: str)      # GET /edge/admin/upstreams/{id}
list_upstreams()                     # GET /edge/admin/upstreams
create_upstream(data: dict)         # POST /edge/admin/upstreams
update_upstream(upstream_id: str, data: dict)   # PUT /edge/admin/upstreams/{id}
delete_upstream(upstream_id: str)   # DELETE /edge/admin/upstreams/{id}
patch_upstream(upstream_id: str, data: dict)    # PATCH /edge/admin/upstreams/{id}

# Route (MISSING - add these)
list_routes()                       # GET /edge/admin/routes
get_route(route_id: str)            # GET /edge/admin/routes/{id}
create_route(data: dict)             # POST /edge/admin/routes
update_route(route_id: str, data: dict)   # PUT /edge/admin/routes/{id}
delete_route(route_id: str)          # DELETE /edge/admin/routes/{id}

# Plugin (if supported)
list_plugins()                      # GET /edge/admin/plugins
```

### 2. API Structure (Backend Proxy)

Create new API router at `backend/app/api/v1/edge_client.py`:

```
GET  /api/v1/edge-client/nodes                                    - List all active edge nodes
GET  /api/v1/edge-client/nodes/{ip}/{port}/upstreams               - List upstreams
GET  /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}         - Get upstream
POST /api/v1/edge-client/nodes/{ip}/{port}/upstreams               - Create upstream
PUT  /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}          - Update upstream
DELETE /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}        - Delete upstream
PATCH /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}        - Patch upstream

GET  /api/v1/edge-client/nodes/{ip}/{port}/routes                  - List routes
GET  /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}              - Get route
POST /api/v1/edge-client/nodes/{ip}/{port}/routes                  - Create route
PUT  /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}             - Update route
DELETE /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}           - Delete route
PATCH /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}            - Patch route

GET  /api/v1/edge-client/nodes/{ip}/{port}/global_rules            - List global rules
GET  /api/v1/edge-client/nodes/{ip}/{port}/global_rules/{id}        - Get global rule
PUT  /api/v1/edge-client/nodes/{ip}/{port}/global_rules/{id}       - Create/Update global rule
PATCH /api/v1/edge-client/nodes/{ip}/{port}/global_rules/{id}      - Update global rule
DELETE /api/v1/edge-client/nodes/{ip}/{port}/global_rules/{id}     - Delete global rule

GET  /api/v1/edge-client/nodes/{ip}/{port}/plugin_configs          - List plugin configs
GET  /api/v1/edge-client/nodes/{ip}/{port}/plugin_configs/{id}      - Get plugin config
PUT  /api/v1/edge-client/nodes/{ip}/{port}/plugin_configs/{id}     - Create/Update plugin config
PATCH /api/v1/edge-client/nodes/{ip}/{port}/plugin_configs/{id}    - Update plugin config
DELETE /api/v1/edge-client/nodes/{ip}/{port}/plugin_configs/{id}   - Delete plugin config

GET  /api/v1/edge-client/nodes/{ip}/{port}/plugin_metadata         - List plugin metadata
GET  /api/v1/edge-client/nodes/{ip}/{port}/plugin_metadata/{name}  - Get plugin metadata
PUT  /api/v1/edge-client/nodes/{ip}/{port}/plugin_metadata/{name}  - Create/Update plugin metadata
DELETE /api/v1/edge-client/nodes/{ip}/{port}/plugin_metadata/{name} - Delete plugin metadata

GET  /api/v1/edge-client/nodes/{ip}/{port}/plugins/list            - List available plugins (names only)
PUT  /api/v1/edge-client/nodes/{ip}/{port}/plugins/reload           - Reload plugins
```
GET  /api/v1/edge-client/nodes                                    - List all active edge nodes
GET  /api/v1/edge-client/nodes/{ip}/{port}/upstreams               - List upstreams
GET  /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}         - Get upstream
POST /api/v1/edge-client/nodes/{ip}/{port}/upstreams               - Create upstream
PUT  /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}          - Update upstream
DELETE /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}        - Delete upstream
PATCH /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}         - Patch upstream

GET  /api/v1/edge-client/nodes/{ip}/{port}/routes                  - List routes
GET  /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}              - Get route
POST /api/v1/edge-client/nodes/{ip}/{port}/routes                  - Create route
PUT  /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}             - Update route
DELETE /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}           - Delete route
PATCH /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}            - Patch route

GET  /api/v1/edge-client/nodes/{ip}/{port}/plugins                 - List plugins
```

### 3. Frontend Page Structure

New page: `frontend/src/views/EdgeClient.vue`

**Tab Structure (6 tabs):**
1. 上游 (Upstreams) - upstream CRUD
2. 路由 (Routes) - route CRUD
3. 全局规则 (Global Rules) - global rule CRUD
4. 插件组 (Plugin Configs) - plugin config CRUD
5. 插件数据 (Plugin Metadata) - plugin metadata CRUD
6. 插件列表 (Plugin List) - read-only list of available plugins

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚠️ Debug Mode - Operations here bypass normal sync workflow   [✕]   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [按集群选择] / [手动输入]                                                │
│  Cluster: [pc-cluster ▼]   Node: [192.168.100.235:11999 ▼]  [🔄]   │
│                                                                        │
│  ┌─────┬────┬────┬────┬────┬────┐                                       │
│  │上游 │路由│全局│插件│插件│插件│                                       │
│  │    │    │规则│组  │数据│列表│  ← Tab bar (6 tabs)                    │
│  └─────┴────┴────┴────┴────┴────┘                                       │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ ID              │ Name      │ Type       │ Nodes    │ Actions   │ │
│  ├──────────────────────────────────────────────────────────────────┤ │
│  │ 431253674958... │ U-811X    │ roundrobin │ 4 nodes  │ [✏️] [🔥] │ │
│  │ 433437599709... │ U-812X    │ roundrobin │ 4 nodes  │ [✏️] [🔥] │ │
│  │ 431260450521... │ R-proxy   │ -          │ -        │ [✏️] [🔥] │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  [+ Add Upstream]   [+ Add Route]   [+ Add Global Rule] ...            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Auto-load behavior:**
- On page load: auto-select first cluster → auto-select first node → load all 6 tabs data in parallel
- On tab switch: instant tab switch (data already loaded)
- On refresh button: reload all 6 tabs in parallel

### 4. UI Design Details

**Layout:**
- Full-width card with warning banner at top
- Node selector dropdown at top-left
- Refresh button at top-right
- Tab bar for Upstreams/Routes/Plugins

**Upstreams Table Columns:**
| Column | Source | Notes |
|--------|--------|-------|
| ID | `value.id` | UUID format |
| Name | `value.name` | or "-" if empty |
| Type | `value.type` | roundrobin/chash/ewma/least_conn |
| Nodes | `value.nodes` | Count + summary |
| Actions | - | Edit, Delete buttons |

**Routes Table Columns:**
| Column | Source | Notes |
|--------|--------|-------|
| ID | `value.id` | UUID format |
| Name | `value.name` | or "-" if empty |
| URI | `value.uri` | Route pattern |
| Methods | `value.methods` | Array, display as tags |
| Upstream | `value.upstream_id` | UUID reference |
| Actions | - | Edit, Delete buttons |

**Modals:**
- Create/Edit form with all fields
- JSON editor for plugins field
- Confirmation dialog for delete

## Technical Implementation

### Backend Files
1. `backend/app/services/edge_client.py` - Added: list_routes, get_route, create_route, update_route, delete_route, list_plugins, list_global_rules, get/create/update/delete_global_rule, list_plugin_configs, get/create/update/delete_plugin_config, list_plugin_metadata, get/create/delete_plugin_metadata, reload_plugins, list_available_plugins
2. `backend/app/api/v1/edge_client.py` - New API router with full CRUD proxy endpoints for upstreams, routes, global_rules, plugin_configs, plugin_metadata, plugins/list
3. `backend/app/api/v1/__init__.py` - Register new router

### Frontend Files
1. `frontend/src/views/EdgeClient.vue` - New debug page with 6 tabs (upstreams, routes, global_rules, plugin_configs, plugin_metadata, plugin_list)
2. `frontend/src/router/index.ts` - Add `/edge-client` route
3. `frontend/src/views/DefaultLayout.vue` - Add navigation link

### Frontend Tab Implementation Details

**Upstreams tab:** Table with CRUD (create via modal, edit via modal, delete with confirm)
**Routes tab:** Table with CRUD
**Global Rules tab:** Table with CRUD
**Plugin Configs tab:** Table with CRUD (includes labels and hosts fields)
**Plugin Metadata tab:** Table with CRUD + reload plugins button
**Plugin List tab:** Read-only table showing all available plugins (序号 + 插件名称)

## Data Flow

```
User -> Frontend (EdgeClient.vue)
     -> API: /api/v1/edge-client/nodes/{ip}/{port}/upstreams
     -> EdgeClient._request(GET, /edge/admin/upstreams)
     -> Edge Server (192.168.100.235:11999)
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Direct deletion could break sync | Show warning that this bypasses normal workflow |
| Edge API differences | Verify API format matches existing EdgeClient patterns |
| No local storage of edge state | This is intentional - debug tool shows live edge state |

## Open Questions

1. Should we auto-refresh the page? (Decision: No, manual refresh only)
2. Do we need to support bulk delete? (Decision: No, single delete only)
3. Should we show node status/health? (Decision: Not in v1, just list nodes)