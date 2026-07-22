## 1. Backend Setup

- [x] 1.1 Add `openpyxl>=3.1.0` dependency to `backend/pyproject.toml` and run `uv sync`

## 2. Backend Export Route

- [x] 2.1 Create `backend/app/api/v1/cluster_export.py` with router and export endpoint `GET /clusters/{cluster_id}/export`
- [x] 2.2 Implement data query: fetch cluster info and all 10 resource types in parallel using `asyncio.gather`. ALL queries MUST succeed before generating the Excel file (all-or-nothing atomic guarantee)
- [x] 2.3 Add `get_or_404` check for cluster existence at the start; return 404 if not found
- [x] 2.4 Generate Excel workbook with openpyxl: create 10 sheets with bold Chinese column headers and auto-adjusted column widths
- [x] 2.5 Populate upstream sheet: merge UpstreamTarget rows into `targets` column as `ip:port(权重N)` semicolon-separated. Show `（无）` if no targets
- [x] 2.6 Populate route sheet: merge RoutePlugin rows into `plugins` column as `plugin_name: {config}` semicolon-separated. Show `（无）` if no plugins. Resolve `upstream_id` → upstream name
- [x] 2.7 Populate static resources sheet: resolve `route_id` → route name
- [x] 2.8 Populate remaining sheets (nodes, plugin_configs, global_rules, plugin_metadata, stream_proxies, ssl_certificates)
- [x] 2.9 Format all JSON fields (timeout, checks, vars, etc.) as pretty-printed JSON strings in cells
- [x] 2.10 Ensure empty-data sheets still get created with header row only
- [x] 2.11 Implement SSL certificate metadata-only export: exclude cert, private_key, sign_cert, sign_key, client_ca, generate_log columns
- [x] 2.12 Exclude `admin_key` from cluster info sheet
- [x] 2.13 Return the Excel file as `StreamingResponse` with Content-Type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and Content-Disposition `attachment; filename*=UTF-8''...`
- [x] 2.14 Register `cluster_export.router` in `backend/app/main.py` (registered via `__init__.py`)

## 3. Frontend Export Button

- [x] 3.1 Add "导出 Excel" button to CentralList.vue in the cluster `expanded-name-row` action bar
- [x] 3.2 Implement `exportCluster()` method: call API with `responseType: 'blob'` and save via existing `downloadBlob()`
- [x] 3.3 Handle loading state and error feedback during export

## 4. Verification

- [x] 4.1 Run `lsp_diagnostics` on all changed backend files
- [x] 4.2 Run `uv run pytest` to verify backend tests pass
- [x] 4.3 Run `npx vitest run` to verify frontend tests pass
