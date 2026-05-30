## ADDED Requirements

### Requirement: Node table shows Edge version column

The nodes table SHALL display a column showing the Edge version of each node, placed immediately to the right of the IP column.

#### Scenario: Edge version column displays version
- **WHEN** the nodes table loads
- **THEN** a column titled "Edge版本" SHALL appear after the IP column
- **THEN** the column SHALL display the value from `status_detail.statistic.edge_version`
- **THEN** if no version data is available, the cell SHALL display "-"

#### Scenario: Edge version updates after status query
- **WHEN** the user clicks "状态查询" on a node and it returns successfully
- **THEN** the table SHALL refresh and the "Edge版本" column SHALL show the new version
- **THEN** the version SHALL be a clean version string (e.g., "2.7.5.26012517"), not a JSON blob

#### Scenario: Edge version column is configurable
- **WHEN** the user opens "列配置"
- **THEN** "Edge版本" SHALL appear as a toggleable column option
- **THEN** it SHALL be checked by default
