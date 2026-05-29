## Why

`clusters.py` (1492行) 混杂了5种资源的CRUD+发布+回滚+历史，可维护性差。`for node in active_nodes:` + EdgeClient 模式重复12次。`plugins.py` (1176行) 99%是数据定义。`useClusterNodes.ts` 的删除流程与其他composable不一致。

## What Changes

1. **拆分 clusters.py** → 按资源拆为5个文件
2. **抽取 edge_sync.py** → 消除12次EdgeClient重复
3. **抽取 plugins.py 数据** → 数据定义移到 config/plugin_definitions.py
4. **修复 useClusterNodes.ts 删除不一致** → 改用 executeDeleteWithProgress

## Capabilities

### New Capabilities
- (无新增能力)

### Modified Capabilities
- (无spec级别变更，纯内部重构)

## Impact

- `backend/app/api/v1/clusters.py` → 拆分为5文件，删除后只保留cluster核心
- `backend/app/services/edge_sync.py` → 新增共享模块
- `backend/app/config/plugin_definitions.py` → 新增数据文件
- `frontend/src/composables/useClusterNodes.ts` → 删除流程对齐
