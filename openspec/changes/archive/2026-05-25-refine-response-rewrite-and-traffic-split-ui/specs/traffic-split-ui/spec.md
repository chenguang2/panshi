## ADDED Requirements

### Requirement: upstream_id uses dropdown selection

The `traffic_split` plugin editor SHALL render `upstream_id` fields as select dropdowns rather than text inputs, with options populated from the system's upstream list.

#### Scenario: upstream_id is a dropdown
- **WHEN** a user edits a `traffic_split` plugin in the drawer
- **THEN** each `upstream_id` field under `splits[*].upstreams[*]` SHALL be rendered as a select dropdown showing upstream names/IDs from the current cluster

### Requirement: upstream list passed to editor

The PluginEditorDrawer SHALL receive the list of available upstreams via props when editing a `traffic_split` plugin.

#### Scenario: upstreams prop is provided
- **WHEN** a `traffic_split` plugin is opened for editing
- **THEN** the editor SHALL have access to an `upstreams` prop containing the upstream list for the current cluster

### Requirement: upstream option display

Each upstream option in the dropdown SHALL display the upstream name, with upstream ID as the value.

#### Scenario: upstream options show name
- **WHEN** the dropdown is opened
- **THEN** each option SHALL show the upstream `name` field, and selecting it SHALL set the value to the upstream `edge_uuid` or ID

### Requirement: schema annotation for select type

The `upstream_id` field in the `traffic_split` plugin schema SHALL include metadata indicating it should use a select/dropdown control.

#### Scenario: schema indicates select control
- **WHEN** the plugin schema is returned from the API
- **THEN** `schema.splits.items.properties.upstreams.items.properties.upstream_id` SHALL include a `component` or similar hint indicating select rendering
