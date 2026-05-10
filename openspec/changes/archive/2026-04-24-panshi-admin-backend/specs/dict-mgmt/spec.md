## ADDED Requirements

### Requirement: Admin can manage dictionary types
The system SHALL allow administrators to create, update, and delete dictionary types.

#### Scenario: Create dictionary type
- **WHEN** admin calls POST /api/v1/dict/types with name and code
- **THEN** system creates dictionary type with unique code
- **AND** returns HTTP 201 with type details

#### Scenario: Duplicate dictionary code
- **WHEN** admin creates dictionary type with existing code
- **THEN** system returns HTTP 409 with error code "DICT_CODE_EXISTS"

#### Scenario: Update dictionary type
- **WHEN** admin calls PUT /api/v1/dict/types/{id}
- **THEN** system updates name, remark, or status

#### Scenario: Delete dictionary type
- **WHEN** admin calls DELETE /api/v1/dict/types/{id}
- **THEN** system deletes type and associated data entries
- **AND** returns HTTP 200

### Requirement: Admin can manage dictionary data
The system SHALL allow administrators to manage enum values within dictionary types.

#### Scenario: Create dictionary data
- **WHEN** admin calls POST /api/v1/dict/datas with type_id, label, value
- **THEN** system creates data entry associated with type
- **AND** returns HTTP 201 with data details

#### Scenario: Update dictionary data
- **WHEN** admin calls PUT /api/v1/dict/datas/{id}
- **THEN** system updates label, value, sort, or status

#### Scenario: Delete dictionary data
- **WHEN** admin calls DELETE /api/v1/dict/datas/{id}
- **THEN** system deletes data entry

### Requirement: User can query dictionary data by type code
The system SHALL allow users to retrieve dictionary data using the type code.

#### Scenario: Get dict data by code
- **WHEN** user calls GET /api/v1/dict/datas/{code}
- **THEN** system returns type info and associated data items
- **AND** items are sorted by sort field

#### Scenario: Get all dict data
- **WHEN** user calls GET /api/v1/dict/datas
- **THEN** system returns all dictionary data
- **AND** optionally filtered by type_code query parameter

### Requirement: Dictionary data includes standard types
The system SHALL be pre-populated with standard dictionary types.

#### Scenario: Standard types exist
- **WHEN** system is initialized
- **THEN** dictionary types include: route_methods, upstream_type, cluster_status, user_role, plugin_builtin
