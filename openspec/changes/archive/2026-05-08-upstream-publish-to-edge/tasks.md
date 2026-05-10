# Tasks: upstream-publish-to-edge

## 1. EdgeLogger Module

- [x] 1.1 Create `backend/app/services/edge_logger.py`
- [x] 1.2 Implement `log_edge_operation` method with full log entry format
- [x] 1.3 Ensure `logs/edge/` directory exists

## 2. EdgeClient Enhancement

- [x] 2.1 Modify EdgeClient `__init__` to accept optional `node_ip` and `node_port` parameters
- [x] 2.2 Update `_resolve_edge_url` to use provided node info when available
- [x] 2.3 Add `_convert_upstream_to_edge_format` helper method

## 3. publish_upstream API Modification

- [x] 3.1 Import EdgeClient and EdgeLogger
- [x] 3.2 Query all active nodes (status=1) in the cluster
- [x] 3.3 Convert upstream data to edge format
- [x] 3.4 For each node, create EdgeClient and sync upstream
- [x] 3.5 Log each operation with EdgeLogger
- [x] 3.6 Aggregate results and return summary response

## 4. Logging Directory

- [x] 4.1 Ensure `logs/edge/` directory creation on startup