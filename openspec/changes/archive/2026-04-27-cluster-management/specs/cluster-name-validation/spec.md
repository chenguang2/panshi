## ADDED Requirements

### Requirement: Cluster name format validation

The system SHALL validate cluster names according to the following rules:
- Only lowercase letters (a-z), digits (0-9), and hyphens (-) are allowed
- Hyphens cannot be at the beginning or end of the name
- Single character names are allowed (e.g., "a", "1")

#### Scenario: Valid cluster names
- **WHEN** user enters "my-cluster", "cluster-123", "a", "123"
- **THEN** the system SHALL accept the cluster name

#### Scenario: Invalid cluster names - uppercase
- **WHEN** user enters "My-Cluster" (contains uppercase)
- **THEN** the system SHALL reject with error "集群名称只能包含小写字母、数字和中划线，中划线不能在首尾"

#### Scenario: Invalid cluster names - hyphen at start
- **WHEN** user enters "-cluster"
- **THEN** the system SHALL reject with error "集群名称只能包含小写字母、数字和中划线，中划线不能在首尾"

#### Scenario: Invalid cluster names - hyphen at end
- **WHEN** user enters "cluster-"
- **THEN** the system SHALL reject with error "集群名称只能包含小写字母、数字和中划线，中划线不能在首尾"

#### Scenario: Invalid cluster names - special characters
- **WHEN** user enters "cluster_name", "cluster.name", "cluster@name"
- **THEN** the system SHALL reject with error "集群名称只能包含小写字母、数字和中划线，中划线不能在首尾"

### Requirement: Cluster name uniqueness validation

The system SHALL ensure cluster names are unique across all users.

#### Scenario: Duplicate cluster name on create
- **WHEN** user creates a cluster with name "my-cluster" that already exists
- **THEN** the system SHALL reject with error "集群名称已存在"

#### Scenario: Duplicate cluster name on update
- **WHEN** user updates a cluster name to "existing-cluster" that belongs to another cluster
- **THEN** the system SHALL reject with error "集群名称已存在"
