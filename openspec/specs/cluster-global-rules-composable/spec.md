## ADDED Requirements

### Requirement: useClusterGlobalRules composable
The system SHALL provide a `useClusterGlobalRules` composable that encapsulates all global rule related state and operations.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterGlobalRules(cluster)` is called
- **THEN** it SHALL return `{ globalRules, loadGlobalRules, addGlobalRule, editGlobalRule, deleteGlobalRule, viewGlobalRule, openGlobalRuleVersionManagement }`
