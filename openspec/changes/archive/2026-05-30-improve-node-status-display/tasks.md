## 1. Backend — ansible_service.py

- [x] 1.1 Fix TextIOWrapper serialization: check stdout/stderr with `isinstance(_, io.IOBase)` and read as string
- [x] 1.2 Capture full ansible-playbook command from `result.config.command` and return in result dict
- [x] 1.3 Add `_parse_nginx_status()`: extract nginx_running, nginx_status, nginx_pid from stdout
- [x] 1.4 Update `build_status_detail()`: parse nginx status for both nginx_cmd_run and edge_statistic tags
- [x] 1.5 Rewrite `_parse_statistic_stdout()`: strip ANSI codes, clean JSON quoting, use `in` matching, parse edge_version JSON
- [x] 1.6 Add `_strip_ansi()` and `_ANSI_RE` module-level helpers
- [x] 1.7 Add `import re` and `import io` dependencies

## 2. Backend — cluster_nodes.py

- [x] 2.1 start/stop/restart endpoints return stdout, stderr, command in response
- [x] 2.2 statistic endpoint returns stdout, stderr, command in response
- [x] 2.3 `_update_status_detail()` preserves nginx key from previous detail when new detail doesn't have it

## 3. Frontend — types

- [x] 3.1 Add `status_detail?: Record<string, any>` to Node interface

## 4. Frontend — useClusterNodes.ts

- [x] 4.1 Add `buildDeleteProgressContent` import from useClusterUtils
- [x] 4.2 Add `executeNodeAction()` shared function with progress dialog pattern
- [x] 4.3 Update `startNode()` to use executeNodeAction
- [x] 4.4 Update `stopNode()` to use executeNodeAction
- [x] 4.5 Update `queryNodeStatus()` to call edge_statistic endpoint with progress dialog
- [x] 4.6 Add `extractKeyInfo()` to highlight nginx status from stdout
- [x] 4.7 Add `edge_version` column to allNodeColumns, default selected
- [x] 4.8 Refresh node list after start/stop/status query completes

## 5. Frontend — ClusterNodes.vue

- [x] 5.1 Add edge_version cell render: read `status_detail.statistic.edge_version`
- [x] 5.2 Add `nginxRunning()` function using `status_detail.nginx.nginx_running`
- [x] 5.3 Update status column text: "健康" when nginx running, "离线" when not

## 6. Environment & Dependencies

- [x] 6.1 Add `ansible-core>=2.17.0` to pyproject.toml
- [x] 6.2 Install ansible.utils collection via ansible-galaxy
- [x] 6.3 Regenerate uv.lock
- [x] 6.4 Rebuild venv with Python 3.11

## 7. OpenSpec

- [x] 7.1 Create proposal artifact
- [x] 7.2 Create design artifact
- [x] 7.3 Create specs: node-action-progress-dialog, node-edge-version-column, nginx-status-detection, node-row-actions (delta)
- [x] 7.4 Create tasks artifact
