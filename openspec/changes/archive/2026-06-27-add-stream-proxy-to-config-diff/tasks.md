## 1. Backend — Add stream proxy comparison to config diff API

- [x] 1.1 backend/app/api/v1/cluster_nodes.py: Add `edge_stream_proxies` fetch in `diff_cluster_config()` (via `EdgeClient.list_stream_routes()`)
- [x] 1.2 backend/app/api/v1/cluster_nodes.py: Add `_compare_stream_proxy()` function — compare listen_port, load_balance (with algorithm normalization), scheme, targets, timeout, keepalive_pool, remote_addr, sni
- [x] 1.3 backend/app/api/v1/cluster_nodes.py: Add `_compare_stream_targets()` helper — parse DB targets JSON and Edge nodes list, return diff result
- [x] 1.4 backend/app/api/v1/cluster_nodes.py: Append stream proxy comparison group to response groups (use `edge_uuid` for matching, `_find_only_in_edge` for Edge-only detection)
- [x] 1.5 Run backend tests: `cd backend && uv run pytest` — confirm no regressions (443 passed, 10 pre-existing failures unchanged)

## 2. Frontend — Add stream proxy field labels in ConfigDiff

- [x] 2.1 frontend/src/views/ConfigDiff.vue: Add `stream_proxies` field label mapping in `fieldLabel()` — 8 field labels with Chinese display names
- [x] 2.2 Run frontend build: `cd frontend && npm run build` — build success

## 3. Specs — Sync delta specs to main specs

- [x] 3.1 Sync delta specs to main specs: manually sync `config-diff` spec changes
- [x] 3.2 Verify main specs are updated
