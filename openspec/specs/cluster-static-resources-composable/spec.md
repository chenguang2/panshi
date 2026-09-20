## Purpose


集群静态资源 composable（useClusterStaticResources）：封装静态资源的加载、上传与删除逻辑。
## Requirements
### Requirement: useClusterStaticResources composable
The system SHALL provide a `useClusterStaticResources` composable that encapsulates all static resource related state and operations.

#### Scenario: Composable returns reactive state
- **WHEN** `useClusterStaticResources(cluster)` is called
- **THEN** it SHALL return `{ staticResources, loadStaticResources, addStaticResource, editStaticResource, deleteStaticResource, uploadStaticResource, publishStaticResource, openStaticResourceVersionManagement }`
