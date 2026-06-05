## NEW Requirements

### Requirement: Static resource management page

#### Scenario: Card grid display
- **WHEN** static resources exist
- **THEN** each resource SHALL display as a card in a 3-column grid
- **THEN** each card SHALL show: name, path, description, file stats, action buttons

#### Scenario: Create/Edit
- **WHEN** admin clicks "添加静态资源" or "编辑"
- **THEN** StaticResourceFormModal SHALL open
- **THEN** "所属集群" SHALL be present

#### Scenario: Actions
- **WHEN** admin clicks action buttons
- **THEN** SHALL use the same functions as cluster management
