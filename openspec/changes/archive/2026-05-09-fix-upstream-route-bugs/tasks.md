# Tasks: fix-upstream-route-bugs

## 1. Upstream Health Check Default

- [x] 1.1 Modify `showAddUpstreamModal` in ClusterList.vue to add default `checks` JSON object to `upstreamForm`
- [x] 1.2 Add `checks` field to the submit data in `handleUpstreamSubmit`
- [x] 1.3 Verify upstream is created with health check config via API

## 2. Route Plugins Bug Investigation

- [x] 2.1 Check RoutePlugin table in database for route "ABCEFG" to see if plugins exist
- [x] 2.2 Check ConfigVersion table to see if plugins are saved in config JSON
- [x] 2.3 Add debug logging to `publish_route` to trace plugins through the flow (skipped - root cause found)
- [x] 2.4 Verify `convert_route_to_edge_format` correctly parses plugin config

## 3. Route Plugins Bug Fix

- [x] 3.1 Fix the root cause if identified in investigation
- [x] 3.2 Verify fix by republishing a route with plugins and checking edge response
- [x] 3.3 Verify version history shows plugins correctly

## 4. Testing

- [x] 4.1 Write backend test to verify plugin config serialization/deserialization
- [x] 4.2 Write backend test to verify upstream is created with default health check (checks dict↔JSON conversion)
- [ ] 4.3 Write E2E test to verify route plugins are preserved after publish