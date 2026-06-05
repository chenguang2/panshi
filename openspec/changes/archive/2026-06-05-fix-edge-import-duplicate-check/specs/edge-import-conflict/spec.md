## MODIFIED Requirements

### Requirement: Conflict detection

#### Scenario: Name conflict no longer blocks import
- **GIVEN** an upstream/route exists in the database
- **WHEN** an Edge record has the same name but a different UUID
- **THEN** the record SHALL be imported (database allows duplicate names)

#### Scenario: UUID conflict blocks import
- **GIVEN** an upstream/route/plugin_config/global_rule exists in the database
- **WHEN** an Edge record has the same edge_uuid
- **THEN** the record SHALL be skipped

#### Scenario: Same-batch deduplication
- **WHEN** Edge data contains multiple records with the same name
- **THEN** all records SHALL be imported regardless of name duplication
- **THEN** conflict checking SHALL only compare against the database, not against other Edge records

#### Scenario: Plugin metadata conflict detection
- **WHEN** previewing an import
- **THEN** plugin metadata conflicts (by plugin_name) SHALL be shown

#### Scenario: Conflict message format
- **WHEN** a conflict is displayed
- **THEN** the message SHALL include both the resource name and the UUID
- **THEN** the message SHALL NOT display only the raw UUID
