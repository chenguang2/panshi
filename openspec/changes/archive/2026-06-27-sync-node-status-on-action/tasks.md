## 1. Backend — Sync node.status on successful node operations

- [x] 1.1 backend/app/api/v1/cluster_nodes.py: Modify `_run_and_update()` — add `node.status` sync logic on success path for `nginx_cmd_run` tag (start/stop/restart/check)
- [x] 1.2 backend/app/api/v1/cluster_nodes.py: Modify `_run_and_update()` — add `node.status` sync logic on success path for `edge_statistic` tag (status query), based on `nginx_running` value
- [x] 1.3 Run backend tests: `cd backend && uv run pytest` — confirm no regressions (426 passed, 3 skipped; 10 pre-existing failures unchanged)

## 2. Specs — Sync delta specs to main specs

- [x] 2.1 Sync delta specs to main specs: manually synced delta specs to `openspec/specs/node-management/spec.md`
- [x] 2.2 Verify: confirmed main spec updated with new scenarios
