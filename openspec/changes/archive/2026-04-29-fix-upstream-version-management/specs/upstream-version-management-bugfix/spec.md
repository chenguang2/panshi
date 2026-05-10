# Upstream Version Management Bug Fixes

## ADDED Requirements

### Requirement: Version selection displays correct JSON details

When a user selects a version from the version list in the VersionManagementModal, the system SHALL display the corresponding JSON configuration in the right panel.

#### Scenario: Select version shows JSON details
- **WHEN** user clicks on a version item in the version list
- **THEN** the right panel SHALL display the JSON configuration for that version
- **AND** the JSON SHALL be formatted and readable

#### Scenario: Selected version is highlighted
- **WHEN** user selects a version
- **THEN** that version item SHALL be visually highlighted in the list

### Requirement: Upstream list refreshes after version switch

When a user switches to a different version via the VersionManagementModal and closes the modal, the upstream list SHALL be refreshed with the latest version data.

#### Scenario: Edit shows switched version after close
- **WHEN** user switches to version v3 in version management modal
- **AND** user closes the version management modal
- **AND** user clicks the "Edit" button for that upstream
- **THEN** the edit modal SHALL display the configuration from v3

#### Scenario: Published event triggers upstream refresh
- **WHEN** version switch (rollback) operation succeeds
- **THEN** the system SHALL emit a 'published' event
- **AND** the parent component SHALL refresh the upstream list
