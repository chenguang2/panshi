## ADDED Requirements

### Requirement: Navigation menu restructuring

The system SHALL organize navigation menu into a hierarchical structure:
- Top-level items: Dashboard, System Management, Cluster Management
- System Management SHALL contain sub-menu items: User Management, Dictionary Management

#### Scenario: Admin sees full menu structure
- **WHEN** an admin user views the navigation menu
- **THEN** the system SHALL display Dashboard, System Management (with children), and Cluster Management

#### Scenario: Non-admin sees simplified menu
- **WHEN** a non-admin user views the navigation menu
- **THEN** the system SHALL NOT display System Management menu item
- **AND** the system SHALL display only Dashboard and Cluster Management

#### Scenario: User clicks System Management submenu
- **WHEN** user clicks on System Management menu
- **THEN** the system SHALL expand to show User Management and Dictionary Management options
