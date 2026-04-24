# form-reset-behavior Specification

## Purpose
TBD - created by archiving change fix-form-reset-on-add. Update Purpose after archive.
## Requirements
### Requirement: Form reset on add action
The system SHALL reset all form fields to empty/initial values when user clicks "Add" button in any management module.

#### Scenario: User list add modal reset
- **WHEN** user clicks "添加用户" button in User Management
- **THEN** username field is empty
- **AND** password field is empty
- **AND** role field is "user"
- **AND** status field is "正常" (value=1)

#### Scenario: Cluster list add modal reset
- **WHEN** user clicks "添加集群" button in Cluster Management
- **THEN** name field is empty
- **AND** display_name field is empty
- **AND** admin_url field is empty
- **AND** admin_key field is empty
- **AND** description field is empty
- **AND** status field is "正常" (value=1)

#### Scenario: Dictionary type add modal reset
- **WHEN** user clicks "添加类型" button in Dictionary Management
- **THEN** code field is empty
- **AND** name field is empty
- **AND** description field is empty
- **AND** status field is "正常" (value=1)

