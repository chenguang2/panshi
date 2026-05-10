# Spec: upstream-sync

## ADDED Requirements

### Requirement: Multi-node upstream synchronization

When publishing an upstream, the system SHALL synchronize the upstream configuration to ALL active edge nodes in the cluster.

#### Scenario: Publish upstream to multiple nodes
- **WHEN** user clicks publish for an upstream
- **THEN** the system SHALL query all nodes with status=1 in the cluster
- **AND** for each active node, create an EdgeClient and call the edge API
- **AND** collect results from all nodes

### Requirement: Batch sync result summary

The system SHALL return a summary of the sync results showing success/failure for each node.

#### Scenario: All nodes sync successfully
- **WHEN** all active nodes sync successfully
- **THEN** return status "ok" with message "上游 xxx 发布成功，已同步到 N 个节点"

#### Scenario: Some nodes fail
- **WHEN** some nodes fail to sync
- **THEN** return status "partial" with message "上游 xxx 发布完成，X/N 节点同步成功"
- **AND** include detailed results for each node

#### Scenario: All nodes fail
- **WHEN** all nodes fail to sync
- **THEN** return status "error" with message "上游 xxx 发布失败：无法连接到任何 edge 服务器"

### Requirement: Upstream data format for edge

The system SHALL convert local upstream format to edge API format.

#### Scenario: Convert upstream to edge format
- **WHEN** preparing upstream data for edge API
- **THEN** convert `load_balance` to `type` (weighted_roundrobin → roundrobin)
- **AND** convert `targets` to edge format `{"ip:port": weight, ...}`
- **AND** include required fields: type, nodes