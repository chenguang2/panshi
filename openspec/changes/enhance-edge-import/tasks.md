## 1. Backend: Change preview endpoint from GET to POST

- [x] Change `/edge-import/preview` from GET to POST
- [x] Move request params (cluster_id, node_id, admin_key) from query to request body
- [x] Add optional admin_key to preview request body schema

## 2. Backend: Add admin_key to request schemas

- [x] Add `admin_key: Optional[str] = None` to `TestConnectionRequest`
- [x] Add `admin_key: Optional[str] = None` to `ImportExecuteRequest`

## 3. Backend: Pass admin_key to service

- [x] Update test_connection endpoint to pass admin_key (if provided) to EdgeImportService.create
- [x] Update preview_import endpoint to pass admin_key (if provided) to EdgeImportService.create
- [x] Update execute_import endpoint to pass admin_key (if provided) to EdgeImportService.create
- [x] Update EdgeImportService.create to accept optional admin_key override parameter
- [x] When admin_key is provided, use it instead of the cluster stored key

## 4. Frontend: Update API functions & types

- [x] Update `getPreview` from GET to POST, add admin_key parameter
- [x] Add admin_key parameter to `testConnection` function
- [x] Add admin_key parameter to `executeImport` function
- [x] Update request type interfaces

## 5. Frontend: Add Admin Key input to step 1

- [x] Add `adminKey` ref to state
- [x] Add password input field below node selector (matching design)
- [x] Pass admin_key in testConnection call
- [x] Pass admin_key in getPreview call (now POST)
- [x] Pass admin_key in executeImport call
- [x] Reset adminKey in handleCancel

## 6. Frontend: Redesign step 2 as config-type card grid

- [x] Replace section-cards with CSS grid card layout
- [x] Create 5 cards with SVG icons (CloudUploadOutlined, BranchesOutlined, PropertySafetyOutlined, BlockOutlined, AppstoreOutlined)
- [x] Each card shows icon + name + checkmark when selected (no counts)
- [x] Click toggles selection on/off
- [x] All cards selected by default
- [x] Disable "下一步" button when nothing selected
- [x] Rename "插件配置" to "插件组" in the card label
- [x] Preserve selection state when navigating back from step 3

## 7. Frontend: Preview fetch on every step 3 entry

- [x] Remove `if (!previewData.value)` guard in goToStep(2)
- [x] Always fetch preview when entering step 3
