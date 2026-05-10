# Spec: route-sync

## ADDED Requirements

### Requirement: Route data format for edge

The system SHALL convert local route format to edge API format.

#### Scenario: Convert route to edge PUT format
- **WHEN** preparing route data for edge API PUT `/edge/admin/routes/{edge_uuid}`
- **THEN** include fields: uri, name, methods, hosts, upstream_id (as edge_uuid string)
- **AND** include plugins if configured
- **AND** include vars and priority if set

Edge API Request Format (PUT):
```json
{
    "uri": "/api/*",
    "name": "route_name",
    "methods": ["GET", "POST"],
    "hosts": ["example.com"],
    "upstream_id": "<upstream_edge_uuid>",
    "priority": 10,
    "vars": [["arg_name", "==", "json"]],
    "plugins": {...}
}
```

Edge API Response Format:
```json
{
    "action": "set",
    "node": {
        "key": "/edge/routes/{edge_uuid}",
        "value": {...}
    }
}
```

### Requirement: Multi-node route synchronization

When publishing a route, the system SHALL synchronize the route configuration to ALL active edge nodes in the cluster.

#### Scenario: Publish route to multiple nodes
- **WHEN** user clicks publish for a route
- **THEN** the system SHALL query all nodes with status=1 in the cluster
- **AND** for each active node, create an EdgeClient and call PUT `/edge/admin/routes/{edge_uuid}`
- **AND** collect results from all nodes

### Requirement: Batch sync result summary

The system SHALL return a summary of the sync results showing success/failure for each node.

#### Scenario: All nodes sync successfully
- **WHEN** all active nodes sync successfully
- **THEN** return status "ok" with message "路由 xxx 发布成功，已同步到 N 个节点"

#### Scenario: Some nodes fail
- **WHEN** some nodes fail to sync
- **THEN** return status "partial" with message "路由 xxx 发布完成，X/N 节点同步成功"
- **AND** include detailed results for each node

#### Scenario: All nodes fail
- **WHEN** all nodes fail to sync
- **THEN** return status "error" with message "路由 xxx 发布失败：无法连接到任何 edge 服务器"

### Requirement: Route version management

The system SHALL save route version before publishing to edge.

#### Scenario: Save version before publish
- **WHEN** user publishes a route
- **THEN** the system SHALL create a ConfigVersion record with resource_type="route"
- **AND** update route.current_version to the new version number

#### Scenario: View route version history
- **WHEN** user opens version management for a route
- **THEN** the system SHALL return list of ConfigVersion records for that route
- **AND** include config snapshot (JSON with edge_uuid) in each version

#### Scenario: Rollback route to version
- **WHEN** user selects a version to rollback
- **THEN** the system SHALL restore route configuration from that version config
- **AND** publish the restored configuration to edge