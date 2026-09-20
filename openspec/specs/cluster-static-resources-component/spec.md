## Purpose


集群静态资源 Vue 组件（ClusterStaticResources）：承载静态资源列表、上传与删除交互。
## Requirements
### Requirement: ClusterStaticResources component
The system SHALL provide a `ClusterStaticResources` component that renders the static resources tab content.

#### Scenario: Component renders static resource list
- **WHEN** `ClusterStaticResources` receives `cluster` prop
- **THEN** it SHALL render resource list with file name, size, version, upload time, actions
- **THEN** it SHALL emit `refresh` when static resources are modified
