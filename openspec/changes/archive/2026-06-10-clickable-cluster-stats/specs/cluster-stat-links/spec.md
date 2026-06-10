# cluster-stat-links Specification

## ADDED Requirements

### Requirement: Cluster card stats are clickable links

Each statistic displayed on a cluster card SHALL be a clickable link that navigates to the corresponding resource management page.

#### Scenario: Clicking route count navigates to route list
- **WHEN** the user clicks the route count on a cluster card
- **THEN** the browser navigates to `/routes?cluster_id={clusterId}`
- **AND** the route list page SHALL display routes filtered to that cluster

#### Scenario: Clicking upstream count navigates to upstream list
- **WHEN** the user clicks the upstream count on a cluster card
- **THEN** the browser navigates to `/upstreams?cluster_id={clusterId}`

#### Scenario: Clicking node count navigates to node list
- **WHEN** the user clicks the node count on a cluster card
- **THEN** the browser navigates to `/nodes?cluster_id={clusterId}`

#### Scenario: Clicking plugin config count navigates to plugin config list
- **WHEN** the user clicks the plugin config count on a cluster card
- **THEN** the browser navigates to `/plugin-configs?cluster_id={clusterId}`

#### Scenario: Clicking global rule count navigates to global rule list
- **WHEN** the user clicks the global rule count on a cluster card
- **THEN** the browser navigates to `/global-rules?cluster_id={clusterId}`

#### Scenario: Clicking plugin metadata count navigates to plugin metadata list
- **WHEN** the user clicks the plugin metadata count on a cluster card
- **THEN** the browser navigates to `/plugin-metadata?cluster_id={clusterId}`

#### Scenario: Clicking static resource count navigates to static resource list
- **WHEN** the user clicks the static resource count on a cluster card
- **THEN** the browser navigates to `/static-resources?cluster_id={clusterId}`

#### Scenario: Right-click opens in new tab
- **WHEN** the user right-clicks on a stat link and selects "Open in new tab"
- **THEN** the link SHALL open in a new tab with the same `cluster_id` parameter

### Requirement: Resource list pages accept cluster_id from URL query

Each resource list page SHALL read `cluster_id` from the URL query string on mount and automatically set the cluster filter, triggering a data reload for that cluster.

#### Scenario: Page loads with cluster_id query
- **WHEN** a resource list page is loaded with `?cluster_id=5` in the URL
- **THEN** the cluster filter dropdown SHALL be set to the cluster with ID 5
- **AND** the page SHALL load data filtered by that cluster

#### Scenario: Page loads without cluster_id query
- **WHEN** a resource list page is loaded without a `cluster_id` query parameter
- **THEN** the cluster filter dropdown SHALL default to "全部集群" (empty)
- **AND** the page SHALL load data for all clusters

#### Scenario: User manually changes filter after auto-set
- **WHEN** the user manually selects a different cluster from the filter dropdown after the page auto-set `cluster_id`
- **THEN** the page SHALL update to show data for the newly selected cluster
- **AND** the URL query parameter SHALL NOT be updated to avoid overwriting the manual selection on re-render

## MODIFIED Requirements

### Requirement: Cluster card shows key metrics

卡片显示的资源统计从纯文本改为可点击链接。

#### Scenario: Card displays node/upstream/route counts
- **WHEN** a cluster card is rendered
- **THEN** it SHALL display seven statistics: node count (healthy/total), upstream count, route count, plugin config count, global rule count, plugin metadata count, and static resource count
- **AND** each statistic SHALL be a clickable link, including the node count in "healthy/total" format
- **AND** the entire statistic value SHALL be the link text (e.g., `3/5`, `5`, `12`)
