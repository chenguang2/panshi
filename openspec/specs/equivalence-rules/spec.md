## ADDED Requirements

### Requirement: Centralized equivalence rules file

The system SHALL provide a YAML configuration file at `backend/app/config/equivalence_rules.yaml` that defines field equivalence rules for config comparison.

#### Scenario: Rules file is loadable
- **WHEN** the application starts
- **THEN** the rules file SHALL be parsed into a Python dict
- **THEN** parsing errors SHALL NOT crash the application

### Requirement: EquivalenceRules engine normalizes fields before comparison

The system SHALL provide an `EquivalenceRules` class that loads the rules file and provides methods to normalize DB and Edge values before comparison.

#### Scenario: Scalar field default is applied
- **WHEN** DB value is `None` for a field with a defined default
- **THEN** the default value SHALL be used in comparison

#### Scenario: Field alias maps DB name to Edge name
- **WHEN** a field has an alias defined (e.g., `load_balance` → `type`)
- **THEN** the Edge value SHALL be looked up using the alias name

#### Scenario: JSON field is recursively filled with defaults
- **WHEN** DB JSON is missing keys that have defined defaults
- **THEN** those keys SHALL be filled before comparison
- **THEN** existing DB keys SHALL NOT be overwritten

#### Scenario: Edge internal fields are ignored
- **WHEN** Edge data contains fields listed in `ignore_edge_keys`
- **THEN** those fields SHALL be removed before comparison

### Requirement: List fields are normalized

The system SHALL normalize DB comma-separated strings to Edge JSON arrays for fields defined in `list_fields`.

#### Scenario: methods field is normalized
- **WHEN** DB value is `"GET,POST"` and Edge value is `["GET","POST"]`
- **THEN** they SHALL be considered equivalent

### Requirement: Plugin JSON is compared per-plugin

The system SHALL split plugin configs by plugin name and apply per-plugin defaults before comparison.

#### Scenario: Plugin with empty config matches Edge with defaults
- **WHEN** DB plugin config is `{}` and that plugin has defined defaults
- **THEN** the filled config SHALL match the Edge config with same default values
