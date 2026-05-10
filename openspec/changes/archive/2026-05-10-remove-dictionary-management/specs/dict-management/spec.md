## REMOVED Requirements

### Requirement: Admin can manage dictionary types
**Reason**: No system component consumes dictionary data. The feature was built but never integrated into any business flow.
**Migration**: N/A — no data migration needed. Tables `sys_dict_type` and `sys_dict_data` can be dropped manually in production.

#### Scenario: Create dictionary type
- **WHEN** admin calls POST /api/v1/dict/types with name and code
- **THEN** system creates dictionary type with unique code

#### Scenario: Duplicate dictionary code
- **WHEN** admin creates dictionary type with existing code
- **THEN** system returns HTTP 409

#### Scenario: Update dictionary type
- **WHEN** admin calls PUT /api/v1/dict/types/{id}
- **THEN** system updates name, description, or status

#### Scenario: Delete dictionary type
- **WHEN** admin calls DELETE /api/v1/dict/types/{id}
- **THEN** system deletes type and associated data entries

### Requirement: Admin can manage dictionary data
**Reason**: Same as above — no consumers.

#### Scenario: Create dictionary data
- **WHEN** admin calls POST /api/v1/dict/datas with type_id, label, value
- **THEN** system creates data entry associated with type

#### Scenario: Update dictionary data
- **WHEN** admin calls PUT /api/v1/dict/datas/{id}
- **THEN** system updates label, value, sort, or status

#### Scenario: Delete dictionary data
- **WHEN** admin calls DELETE /api/v1/dict/datas/{id}
- **THEN** system deletes data entry

### Requirement: User can query dictionary data by type code
**Reason**: Same as above — no consumers.

#### Scenario: Get dict data by code
- **WHEN** user calls GET /api/v1/dict/datas/{code}
- **THEN** system returns type info and associated data items
