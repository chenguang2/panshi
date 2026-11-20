# table-sorting Specification

## Purpose
TBD - created by archiving change paging-and-query. Update Purpose after archive.

## Requirements

### Requirement: Sortable columns

The system SHALL allow users to sort table data by clicking on column headers **仅限平铺（flat）视图**。三个独立列表页（节点/上游/路由管理）在分组视图下表头点击 SHALL NOT 触发排序——分组模式的排序拦截、一次性引导提示与排序键跨模式保留语义由 `list-page-cluster-grouping` 能力规格定义。节点管理页与上游管理页当前无可排序列，平铺模式 SHALL 与生产现状一致（SHALL NOT 发明生产没有的排序能力）。

#### Scenario: Click sortable column header

- **WHEN** user clicks on a sortable column header (名称, URI, 优先级, 状态, 创建时间) **in 平铺 mode**
- **THEN** the table SHALL sort data by that column in ascending order

### Requirement: Toggle sort direction
The system SHALL toggle between ascending and descending order when the same column header is clicked again.

#### Scenario: Click same column toggles to descending
- **WHEN** user clicks on a column header that is currently sorted ascending
- **THEN** the table SHALL re-sort data in descending order

#### Scenario: Click same column toggles back to ascending
- **WHEN** user clicks on a column header that is currently sorted descending
- **THEN** the table SHALL re-sort data in ascending order

### Requirement: Visual sort indicator
The system SHALL display a visual indicator (arrow icon) showing the current sort direction on the sorted column.

#### Scenario: Ascending sort indicator
- **WHEN** data is sorted ascending by a column
- **THEN** an upward arrow icon SHALL appear on that column header

#### Scenario: Descending sort indicator
- **WHEN** data is sorted descending by a column
- **THEN** a downward arrow icon SHALL appear on that column header

### Requirement: Sortable fields
The sortable fields for routes SHALL include: name, uri, priority, status, created_at.

#### Scenario: Sort by name
- **WHEN** user clicks "名称" column header
- **THEN** routes SHALL be sorted alphabetically by name

#### Scenario: Sort by priority
- **WHEN** user clicks "优先级" column header
- **THEN** routes SHALL be sorted numerically by priority

### Requirement: API sort parameters
The system SHALL pass sort parameters to the API: sort_by (field name) and sort_order (asc/desc).

#### Scenario: API receives sort parameters
- **WHEN** user sorts by "名称" ascending
- **THEN** API SHALL receive `sort_by=name&sort_order=asc`
