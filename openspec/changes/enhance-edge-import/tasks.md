## 1. Backend: Change preview endpoint from GET to POST

- [ ] Change `/edge-import/preview` from GET to POST
- [ ] Move request params (cluster_id, node_id, admin_key) from query to request body
- [ ] Add optional admin_key to preview request body schema

## 2. Backend: Add admin_key to request schemas

- [ ] Add `admin_key: Optional[str] = None` to `TestConnectionRequest`
- [ ] Add `admin_key: Optional[str] = None` to `ImportExecuteRequest`

## 3. Backend: Pass admin_key to service

- [ ] Update test_connection endpoint to pass admin_key (if provided) to EdgeImportService.create
- [ ] Update preview_import endpoint to pass admin_key (if provided) to EdgeImportService.create
- [ ] Update execute_import endpoint to pass admin_key (if provided) to EdgeImportService.create
- [ ] Update EdgeImportService.create to accept optional admin_key override parameter
- [ ] When admin_key is provided, use it instead of the cluster stored key

## 4. Frontend: Update API functions & types

- [ ] Update `getPreview` from GET to POST, add admin_key parameter
- [ ] Add admin_key parameter to `testConnection` function
- [ ] Add admin_key parameter to `executeImport` function
- [ ] Update request type interfaces

## 5. Frontend: Add Admin Key input to step 1

- [ ] Add `adminKey` ref to state
- [ ] Add password input field below node selector (matching design)
- [ ] Pass admin_key in testConnection call
- [ ] Pass admin_key in getPreview call (now POST)
- [ ] Pass admin_key in executeImport call
- [ ] Reset adminKey in handleCancel

## 6. Frontend: Redesign step 2 as config-type card grid

- [ ] Replace section-cards with CSS grid card layout
- [ ] Create 5 cards with SVG icons (CloudUploadOutlined, BranchesOutlined, PropertySafetyOutlined, BlockOutlined, AppstoreOutlined)
- [ ] Each card shows icon + name + checkmark when selected (no counts)
- [ ] Click toggles selection on/off
- [ ] All cards selected by default
- [ ] Disable "下一步" button when nothing selected
- [ ] Rename "插件配置" to "插件组" in the card label
- [ ] Preserve selection state when navigating back from step 3
- [ ] Remove unused expandedSections and column definitions for step 2

## 7. Frontend: Preview fetch on every step 3 entry

- [ ] Remove `if (!previewData.value)` guard in goToStep(2)
- [ ] Always fetch preview when entering step 3
