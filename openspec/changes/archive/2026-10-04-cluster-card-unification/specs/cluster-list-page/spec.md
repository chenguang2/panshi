# cluster-list-page Delta

## MODIFIED Requirements

### Requirement: Cluster card displays key information

Each cluster card SHALL display essential information.

#### Scenario: Card header

- **WHEN** a cluster card is rendered
- **THEN** the card header SHALL display the cluster display name, group name, and a status badge (运行中/已禁用)
- **AND** the group name SHALL be shown in the card header area

#### Scenario: Card statistics

- **WHEN** a cluster card is rendered
- **THEN** it SHALL display seven statistics: node count (healthy/total), upstream count, route count, plugin config count, global rule count, plugin metadata count, and static resource count

#### Scenario: Card actions

- **WHEN** a cluster card is rendered
- **THEN** it SHALL display "详情", "编辑", "测试" action buttons
- **AND** it SHALL NOT display a "同步" button
- **AND** it SHALL provide a dropdown menu with "删除集群" action

#### Scenario: Node tags

- **WHEN** a cluster card is rendered and the cluster has nodes
- **THEN** the card SHALL display node tags (IP:port) with online/offline status indicators

#### Scenario: Shared component rendering

- **WHEN** a cluster card is rendered on the cluster management page or the unified management page
- **THEN** the card SHALL be rendered by the shared `ClusterCard.vue` component
- **AND** both pages SHALL present identical card anatomy, including the relay/direct path badge
