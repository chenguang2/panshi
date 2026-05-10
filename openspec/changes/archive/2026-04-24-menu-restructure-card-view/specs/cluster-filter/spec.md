## ADDED Requirements

### Requirement: Cluster list filtering by creator

The system SHALL filter cluster lists based on the user's role:
- Admin users SHALL see all clusters regardless of creator
- Non-admin users SHALL only see clusters they created

#### Scenario: Admin views all clusters
- **WHEN** an admin user requests the cluster list
- **THEN** the system SHALL return all clusters in the database

#### Scenario: Non-admin views own clusters only
- **WHEN** a non-admin user requests the cluster list
- **THEN** the system SHALL return only clusters where `creator_id` matches the current user

#### Scenario: Non-admin cannot access other user's clusters
- **WHEN** a non-admin user attempts to view another user's cluster details
- **THEN** the system SHALL return a 403 Forbidden error
