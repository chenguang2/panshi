## Purpose


全站共享的集群选择控件：以「分组展示 + 关键字搜索」的统一形态覆盖筛选（可选全部集群）与必选（表单字段、单集群操作页）两类场景，作为各页面集群下拉的唯一实现，消除内联复制的多份级联/扁平下拉。

## Requirements
### Requirement: Cluster selector presents clusters grouped by group name
The cluster selector SHALL render clusters under one opt-group header per distinct non-empty `group_name`, with groups sorted by name; clusters with empty `group_name` SHALL appear under a 「未分组」 header placed after all named groups. Each option label SHALL use the cluster display name falling back to its name.

#### Scenario: Grouped presentation
- **WHEN** the selector opens with clusters spanning multiple groups
- **THEN** options SHALL be nested under one header per group, groups sorted by name
- **AND** clusters within a group SHALL be sorted by display name

#### Scenario: Ungrouped clusters at the end
- **WHEN** some injected clusters have no `group_name`
- **THEN** they SHALL appear under a 「未分组」 header placed after all named groups

### Requirement: Cluster selector supports keyword search
The selector SHALL provide keyword search over cluster display names and names, case-insensitive, applied within the currently injected cluster list only.

#### Scenario: Search narrows options
- **WHEN** the user types a keyword into the selector
- **THEN** only clusters whose display name or name contains the keyword SHALL remain visible
- **AND** groups left with no matching clusters SHALL be hidden

### Requirement: Cluster selector supports all-clusters mode
In filter contexts the selector SHALL offer an explicit 「全部集群」 option rendered as the first option, representing "no specific cluster selected".

#### Scenario: 全部集群 selectable
- **WHEN** the selector is in all-clusters mode and the user picks 「全部集群」
- **THEN** the bound value SHALL represent no specific cluster selection
- **AND** no placeholder SHALL be shown in place of the 「全部集群」 label

### Requirement: Cluster selector supports mandatory mode
In form-field or single-cluster operation contexts the selector SHALL NOT offer the 「全部集群」 option and SHALL NOT allow clearing a chosen cluster; before any selection the placeholder 「请选择集群」 SHALL be shown.

#### Scenario: Mandatory mode hides all-option and clearing
- **WHEN** the selector is used where a specific cluster must be chosen (required form field, edge.env page)
- **THEN** no 「全部集群」 option SHALL be present
- **AND** a chosen selection SHALL NOT be clearable
- **AND** the placeholder 「请选择集群」 SHALL display until a cluster is chosen

### Requirement: Cluster selector does not fetch cluster data
The selector SHALL render exclusively from the cluster list injected by its consumer and SHALL NOT initiate network requests.

#### Scenario: Injected list changes flow through
- **WHEN** the consumer's cluster list changes (for example narrowed by the page's group filter)
- **THEN** the selector options SHALL update to match the injected list without any request initiated by the selector
