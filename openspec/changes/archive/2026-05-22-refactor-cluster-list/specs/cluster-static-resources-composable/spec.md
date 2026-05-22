## ADDED Requirements

### Requirement: useClusterStaticResources composable
The system SHALL provide a `useClusterStaticResources` composable that encapsulates all static resource related state and operations.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterStaticResources(cluster)` is called
- **THEN** it SHALL return `{ staticResources, loadStaticResources, addStaticResource, editStaticResource, deleteStaticResource, uploadStaticResource, publishStaticResource, openStaticResourceVersionManagement }`
