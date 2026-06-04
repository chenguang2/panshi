## Why

Edge data import page needs to align with the updated design mockup (docs/ui/Live-Artifact-4/edge-import.html): add Admin Key input for node authentication, replace the step 2 selection UI with config-type card grid, and rename "插件配置" to "插件组".

## What Changes

- Add Admin Key input field to step 1 (node selection), with default value fallback logic matching cluster add flow
- Pass admin_key through the entire import flow (test connection, preview, execute)
- Redesign step 2 "选择配置" as config-type card grid matching the design mockup
- Rename "插件配置" to "插件组" in step 2
- Keep step 3 preview and import logic as-is

## Capabilities

### New Capabilities
- `edge-import-admin-key`: Admin Key authentication for Edge node connection
- `edge-import-config-selection`: Config type selection via card grid UI

### Modified Capabilities
- _(none — new capabilities only)_

## Impact

- `frontend/src/views/EdgeImport.vue`: Restructure step 1 (add Admin Key), redesign step 2 (card grid), step 3 unchanged
- `frontend/src/api/edgeImport.ts`: Add admin_key to API function parameters
- `backend/app/schemas/edge_import.py`: Add optional admin_key to request schemas
- `backend/app/api/v1/edge_import.py`: Pass admin_key to service
- `backend/app/services/edge_import_service.py`: Accept admin_key override from request
