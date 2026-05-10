# Edge Client Debug Page

## Why

During development and debugging of the multi-cluster gateway system, developers need a way to directly query and manipulate edge server configurations without going through the normal publish workflow. The edge server at 192.168.100.235:11999 maintains upstream, route, and plugin data that needs to be visible and editable for debugging purposes.

## What Changes

- **New Page**: Add `/edge-client` route in frontend to display edge server data
- **Backend API**: Create `/api/v1/edge-client/*` endpoints for querying edge nodes
- **Data Display**: Show all upstreams, routes, and plugins from edge servers
- **Operations**: Support query, create, update, delete for upstreams and routes via edge API
- **Cluster Selection**: Allow selecting which cluster/edge node to debug

## Capabilities

### New Capabilities

- `edge-client-debug`: UI page and API for direct edge server debugging
  - List all upstreams from edge server
  - List all routes from edge server
  - List all plugins from edge server
  - Create/Update/Delete upstreams via edge API
  - Create/Update/Delete routes via edge API
  - Node selection (IP:port) for targeting specific edge instance

### Modified Capabilities

None - this is a new debug tool, not modifying existing functionality.

## Impact

- **Frontend**: New page at `/edge-client` with tabs for Upstreams, Routes, Plugins
- **Backend**: New API endpoints under `/api/v1/edge-client/`
- **EdgeClient Service**: Extend existing service with query/delete methods
- **EdgeLogger**: Continue writing to route.log/upstream.log for operations
- **No existing functionality modified**: This is purely additive for debugging

## Technical Approach

- Use existing `EdgeClient` class for API communication
- Reuse authentication from current session
- Target edge server at configurable IP:port
- JSON editor for plugin configuration
- Modal dialogs for create/edit operations