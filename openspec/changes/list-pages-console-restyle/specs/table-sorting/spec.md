# Spec Delta

## MODIFIED Requirements

### Requirement: Sortable columns

The system SHALL allow users to sort table data by clicking on column headers **仅限平铺（flat）视图**。三个独立列表页（节点/上游/路由管理）在分组视图下表头点击 SHALL NOT 触发排序——分组模式的排序拦截、一次性引导提示与排序键跨模式保留语义由 `list-page-cluster-grouping` 能力规格定义。节点管理页与上游管理页当前无可排序列，平铺模式 SHALL 与生产现状一致（SHALL NOT 发明生产没有的排序能力）。

#### Scenario: Click sortable column header

- **WHEN** user clicks on a sortable column header (名称, URI, 优先级, 状态, 创建时间) **in 平铺 mode**
- **THEN** the table SHALL sort data by that column in ascending order
