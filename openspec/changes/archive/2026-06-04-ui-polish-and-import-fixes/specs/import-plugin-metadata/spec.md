## NEW Requirements

### Requirement: Plugin metadata selection during import

The Edge data import preview step SHALL allow users to toggle plugin metadata import via a checkbox, consistent with other resource types.

#### Scenario: Preview checkbox
- **WHEN** the preview step shows plugin metadata section
- **THEN** an `<a-checkbox>` SHALL appear in the section header
- **THEN** the checkbox SHALL be checked by default

#### Scenario: Frontend selection state
- **WHEN** the import form is initialized
- **THEN** `selections.plugin_metadata` SHALL be `true`
- **WHEN** import is cancelled
- **THEN** `selections.plugin_metadata` SHALL be reset to `true`
- **WHEN** import is executed
- **THEN** `plugin_metadata: selections.plugin_metadata` SHALL be sent in the API request

#### Scenario: Backend schema
- **WHEN** the backend receives an import request
- **THEN** `ImportSelection.plugin_metadata` SHALL be accepted as `bool` (default `True`)

#### Scenario: Conditional import
- **WHEN** `selections.plugin_metadata` is `true`
- **THEN** plugin metadata SHALL be imported from the Edge node
- **WHEN** `selections.plugin_metadata` is `false`
- **THEN** plugin metadata import SHALL be skipped
