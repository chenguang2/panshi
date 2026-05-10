# Edge Client Debug Page - Tasks

## 1. Backend - EdgeClient Enhancement

Add missing methods to `backend/app/services/edge_client.py`:

- [x] 1.1 Add `list_routes()` - GET /edge/admin/routes, returns parsed `node.nodes[]`
- [x] 1.2 Add `get_route(route_id: str)` - GET /edge/admin/routes/{id}
- [x] 1.3 Add `create_route(data: dict)` - POST /edge/admin/routes
- [x] 1.4 Add `list_plugins()` - GET /edge/admin/plugins (if supported by edge API)

**Response Parsing Helper:**
```python
def _parse_node_list(self, response: dict) -> list:
    """Parse edge admin list response to extract nodes array."""
    if response.get("node", {}).get("dir"):
        return response["node"].get("nodes", [])
    return [response["node"]] if response.get("node") else []
```

## 2. Backend - API Router

Create `backend/app/api/v1/edge_client.py` with proxy endpoints:

- [x] 2.1 Create router with node selection endpoint:
  - `GET /api/v1/edge-client/nodes` - List all active nodes across clusters

- [x] 2.2 Create upstream proxy endpoints:
  - `GET /api/v1/edge-client/nodes/{ip}/{port}/upstreams` - List upstreams
  - `GET /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}` - Get upstream
  - `POST /api/v1/edge-client/nodes/{ip}/{port}/upstreams` - Create upstream
  - `PUT /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}` - Update upstream
  - `DELETE /api/v1/edge-client/nodes/{ip}/{port}/upstreams/{id}` - Delete upstream

- [x] 2.3 Create route proxy endpoints:
  - `GET /api/v1/edge-client/nodes/{ip}/{port}/routes` - List routes
  - `GET /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}` - Get route
  - `POST /api/v1/edge-client/nodes/{ip}/{port}/routes` - Create route
  - `PUT /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}` - Update route
  - `DELETE /api/v1/edge-client/nodes/{ip}/{port}/routes/{id}` - Delete route

- [x] 2.4 Create plugin proxy endpoint:
  - `GET /api/v1/edge-client/nodes/{ip}/{port}/plugins` - List plugins

- [x] 2.5 Register router in `backend/app/api/v1/__init__.py`

**Extended endpoints (beyond original spec):**
- Global rules CRUD: `/global_rules`
- Plugin configs CRUD: `/plugin_configs`
- Plugin metadata CRUD: `/plugin_metadata`
- Available plugins list: `/plugins/list`
- Plugin reload: `/plugins/reload`

## 3. Frontend - Page Component

Create `frontend/src/views/EdgeClient.vue`:

- [x] 3.1 Add warning banner component (orange background, ⚠️ icon)
- [x] 3.2 Add node selector dropdown (cluster + ip:port)
- [x] 3.3 Add refresh button
- [x] 3.4 Add tab bar (6 tabs: Upstreams / Routes / Global Rules / Plugin Configs / Plugin Metadata / Plugin List)

- [x] 3.5 Implement Upstreams tab:
  - Table with columns: ID, Name, Type, Nodes, Actions
  - Parse edge response `node.nodes[]` for list
  - Edit/Delete action buttons

- [x] 3.6 Implement Routes tab:
  - Table with columns: ID, Name, URI, Methods (tags), Upstream, Actions
  - Parse edge response `node.nodes[]` for list
  - Edit/Delete action buttons

- [x] 3.7 Implement Plugins tab (read-only):
  - Table with columns: Name, Config (JSON viewer)

- [x] 3.8 Add Create/Edit modal for Upstream:
  - Fields: Name, Type (dropdown), Nodes (key-value editor)

- [x] 3.9 Add Create/Edit modal for Route:
  - Fields: Name, URI, Methods (multi-select), Hosts, Priority, Upstream ID, Plugins (JSON)

- [x] 3.10 Add Delete confirmation dialogs

## 4. Frontend - Navigation

- [x] 4.1 Add route `/edge-client` in `frontend/src/router/index.ts`
- [x] 4.2 Add link to Edge Client page in `frontend/src/views/DefaultLayout.vue` sidebar

## 5. Testing

- [x] 5.1 Write backend tests for edge client API (tests/test_edge_client_api.py - expanded coverage for global_rules, plugin_configs, plugin_metadata, plugins/list)
- [x] 5.2 Write E2E tests for edge client page (frontend/e2e/edge-client.spec.ts - 13 test cases)