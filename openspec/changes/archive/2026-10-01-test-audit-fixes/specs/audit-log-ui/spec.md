# audit-log-ui Delta

## MODIFIED Requirements

### Requirement: Export to CSV/Excel with large dataset support
The page SHALL provide "导出" button exporting filtered results to CSV or Excel. For large datasets (>5000 rows), backend SHALL generate file asynchronously and provide download link to avoid frontend OOM/timeout. Exported cell values SHALL be neutralized against spreadsheet formula injection: a value whose first character is one of `=`, `+`, `-`, `@` (or a tab/CR) SHALL receive a leading single-quote prefix before being written, for both CSV and XLSX exports.

#### Scenario: Export current filtered results (small dataset)
- **WHEN** admin clicks "导出 CSV" and filtered count ≤ 5000
- **THEN** frontend streams all pages, calls `exportToCsv(data, filename)` from shared util

#### Scenario: Export large dataset (async backend generation)
- **WHEN** admin clicks "导出 CSV" and filtered count > 5000
- **THEN** frontend calls `POST /api/v1/system/operations/export` with filters
- **THEN** backend returns `{task_id: "..."}`, polls `/api/v1/system/operations/export/{task_id}` until `status="ready"`
- **THEN** downloads file via `GET /api/v1/system/operations/export/{task_id}/download`

#### Scenario: Export Excel
- **WHEN** admin clicks "导出 Excel"
- **THEN** downloads .xlsx with proper column widths and headers (same async logic for large datasets)

#### Scenario: Export neutralizes formula injection
- **WHEN** an exported cell value (e.g. a description field) begins with `=`, `+`, `-` or `@`
- **THEN** the cell SHALL be written with a leading single-quote prefix so spreadsheets treat it as text
- **AND** the neutralization SHALL apply to both CSV and XLSX exports, verified by export round-trip tests
