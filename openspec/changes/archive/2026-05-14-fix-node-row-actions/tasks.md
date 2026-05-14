## 1. Modify action handler to pass row record

- [x] 1.1 Update `handleNodeAction` — edit/delete branches pass `record` to `editNode`/`deleteNode`
- [x] 1.2 Add optional `node` parameter to `editNode(cluster, node?)` — use passed node first, fall back to `cluster.selectedNode`
- [x] 1.3 Add optional `node` parameter to `deleteNode(cluster, node?)` — same fallback logic
- [x] 1.4 Update `deleteNode` confirm dialog and API call to use the passed `target`
