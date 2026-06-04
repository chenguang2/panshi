## 1. UserList: Replace TableCard with hand-written table

- [x] Replace `<TableCard>` with hand-written `<table>` + `<thead>` + `<tbody>`
- [x] Remove TableCard import and tableColumns computed
- [x] Add table CSS: `.table-container`, `table`, `thead th`, `tbody tr`, `tbody td`

## 2. UserList: Fix delete confirmation

- [x] Replace native `confirm()` with `Modal.confirm` from ant-design-vue
- [x] Add `Modal` to ant-design-vue import

## 3. UserList: Reset cluster permissions on new user

- [x] Add `selectedClusterIds.value = []` to `openAddModal()`

## 4. UserList: Align filter bar CSS with UpstreamList

- [x] Remove scoped `.form-input`, `.form-input:focus`, `.form-input::placeholder` overrides
- [x] Remove scoped `.search-input-wrap`, `.search-input-wrap input`, `.search-icon` overrides
- [x] Change `flex-wrap: nowrap` to `flex-wrap: wrap`
- [x] Remove unused `.filter-select` CSS class
- [x] Clean up responsive media query

## 5. EdgeImport: Add plugin_metadata checkbox

- [x] Add `plugin_metadata: true` to `selections` reactive
- [x] Add `<a-checkbox>` to plugin metadata section header
- [x] Add `plugin_metadata` to handleImport payload
- [x] Add `plugin_metadata` to handleCancel reset

## 6. EdgeImport: Backend support

- [x] Add `plugin_metadata: bool = True` to `ImportSelection` schema
- [x] Wrap plugin metadata import in `if selections.plugin_metadata:` condition
- [x] Update frontend `ImportSelections` interface

## 7. Tools: Responsive textarea layout

- [x] Set `.tools-layout` height to `calc(100vh - 96px)`
- [x] Change layout chain to flex-fill (tools-content → tool-panel → dual-panel → panels)
- [x] Add responsive textarea CSS with `flex: 1` and `min-height`
- [x] Calculate `textareaRows` dynamically based on `window.innerHeight`
- [x] Replace all `:rows="20"` / `:rows="18"` with `:rows="textareaRows"`

## 8. Tools: Copy button layout

- [x] Wrap copy/paste button pairs in `<div class="copy-row">`
- [x] Add `.copy-row` CSS: `display: flex; gap: 8px; margin-top: 8px`
