## Why

User management page still used Ant Design TableCard while route/upstream lists had been converted to hand-written CSS tables, causing visual inconsistency. Edge import preview lacked plugin_metadata selection checkbox. Tools page textareas had fixed sizes instead of filling available viewport space.

## What Changes

- Convert UserList.vue table from Ant Design TableCard to hand-written CSS table matching RouteList/UpstreamList style
- Fix UserList.vue delete to use Modal.confirm instead of native confirm()
- Align UserList.vue filter bar CSS with UpstreamList (remove scoped overrides, use global form-input)
- Fix UserList.vue new user modal not resetting cluster permissions
- Add plugin_metadata checkbox to EdgeImport preview step (frontend + backend)
- Make Tools.vue textareas fill available height and auto-resize with window

## Capabilities

### New Capabilities
- `user-list-table`: User list page with hand-written CSS table matching route/upstream style
- `tools-responsive-layout`: Tools page with viewport-responsive textarea sizing
- `import-plugin-metadata`: Plugin metadata selection during Edge data import

### Modified Capabilities
- _(none — no existing spec-level requirement changes)_

## Impact

- `frontend/src/views/UserList.vue`: TableCard replaced with hand-written table, filter CSS aligned, delete modal fixed, cluster permission reset fixed
- `frontend/src/views/EdgeImport.vue`: Added plugin_metadata checkbox and selection state
- `frontend/src/api/edgeImport.ts`: ImportSelections interface updated
- `frontend/src/views/Tools.vue`: Layout changed to flex-fill, textarea rows dynamic
- `backend/app/schemas/edge_import.py`: ImportSelection model updated
- `backend/app/services/edge_import_service.py`: Conditional plugin_metadata import
