## Purpose


集群全局规则 composable（useClusterGlobalRules）：封装全局规则的加载、保存与删除逻辑，供组件层复用。
## Requirements
### Requirement: useClusterGlobalRules composable
The system SHALL provide a `useClusterGlobalRules` composable that encapsulates all global rule related state and operations.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterGlobalRules(cluster)` is called
- **THEN** it SHALL return `{ globalRules, loadGlobalRules, addGlobalRule, editGlobalRule, deleteGlobalRule, viewGlobalRule, openGlobalRuleVersionManagement }`
