# Cluster Node Edge Path

## ADDED Requirements

### Requirement: Node edge_path field is required

When creating or updating a cluster node, the edge_path field SHALL be a required string field with a maximum length of 255 characters.

#### Scenario: Create node with valid edge_path
- **WHEN** user creates a new node with edge_path "/edge/node1"
- **THEN** the node SHALL be created successfully with edge_path "/edge/node1"

#### Scenario: Create node without edge_path
- **WHEN** user attempts to create a node without providing edge_path
- **THEN** the system SHALL return a validation error indicating edge_path is required

#### Scenario: Create node with edge_path exceeding max length
- **WHEN** user attempts to create a node with edge_path longer than 255 characters
- **THEN** the system SHALL return a validation error indicating edge_path exceeds maximum length

### Requirement: Node edge_path format validation

The edge_path field SHALL only accept strings that start with a forward slash (/).

#### Scenario: Create node with valid edge_path format
- **WHEN** user creates a node with edge_path "/valid/path"
- **THEN** the node SHALL be created successfully

#### Scenario: Create node with edge_path not starting with /
- **WHEN** user attempts to create a node with edge_path "invalid/path"
- **THEN** the system SHALL return a validation error indicating edge_path must start with /

#### Scenario: Create node with empty edge_path
- **WHEN** user attempts to create a node with edge_path ""
- **THEN** the system SHALL return a validation error indicating edge_path is required

### Requirement: Node edge_path displayed in list columns

The edge_path field SHALL be available as a displayable column in the node list, but SHALL NOT be selected by default.

#### Scenario: Display node list without edge_path column
- **WHEN** user views the node list with default column configuration
- **THEN** the edge_path column SHALL NOT be visible

#### Scenario: Display node list with edge_path column enabled
- **WHEN** user enables edge_path column in column configuration
- **THEN** the edge_path column SHALL be visible showing each node's edge_path value
