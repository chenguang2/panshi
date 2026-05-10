# Tasks: route-publish-to-edge

## 1. Backend - EdgeClient Route Methods

- [x] 1.1 Add `update_route` method to EdgeClient (PUT `/edge/admin/routes/{edge_uuid}`)
- [x] 1.2 Add `delete_route` method to EdgeClient (DELETE `/edge/admin/routes/{edge_uuid}`)
- [x] 1.3 Add `convert_route_to_edge_format` static method to EdgeClient

## 2. Backend - Route Publish API

- [x] 2.1 Modify `publish_route` in routes.py to:
  - Query all active nodes (status=1) in the cluster
  - Convert route to edge format using EdgeClient
  - For each node, call EdgeClient.update_route(edge_uuid, edge_data)
  - Log each operation with EdgeLogger to `logs/edge/route.log`
  - Aggregate results and return summary response
- [x] 2.2 Include `edge_uuid` in config_data for ConfigVersion

## 3. Backend - Route Rollback API Enhancement

- [x] 3.1 Modify `rollback_route` to publish restored route to edge after rollback

## 4. Frontend - Publish Modal

- [x] 4.1 Update `publishRoute` in ClusterList.vue to show modal with real-time logs
- [x] 4.2 Update `publishRouteByRecord` to show modal with real-time logs

## 5. Testing

- [x] 5.1 Write E2E test for route publish flow (frontend/e2e/route-publish.spec.ts)
- [x] 5.2 Verify EdgeLogger writes to `logs/edge/route.log` and shows decrypted response