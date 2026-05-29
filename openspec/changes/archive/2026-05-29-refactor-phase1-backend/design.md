## Context

后端代码存在大量重复模式，尤其是 cluster.py 承担了过多职责，边缘节点同步逻辑散落在12个地方。

## Goals / Non-Goals

**Goals:**
- clusters.py 从1492行降至~300行
- 消除12次重复的 for-node + EdgeClient 模式
- plugins.py 从1176行降至~20行
- useClusterNodes.ts 删除流程与其他composable对齐

**Non-Goals:**
- 不改动前端 composable 的共享模式抽取（留到阶段二）
- 不改动 EdgeClient 遗留方法清理
- 不改动测试覆盖

## Approach

### 1. 拆分 clusters.py

按资源拆分为5个文件，每个使用子 APIRouter，统一挂载到主 router：

```
# 拆分后文件结构：
backend/app/api/v1/
├── clusters.py          # cluster CRUD + stats (~300行)
├── cluster_upstreams.py      # upstream CRUD + publish/rollback/history
├── cluster_plugin_configs.py # plugin_config CRUD + publish/rollback/history  
├── cluster_global_rules.py   # global_rule CRUD + publish/rollback/history
├── cluster_nodes.py          # node CRUD + start/stop/status
└── __init__.py         # 统一挂载所有子 router
```

每个子 router 共享 `get_current_user`、`get_db` 依赖。

### 2. 抽取 edge_sync.py

```python
# backend/app/services/edge_sync.py
async def sync_to_nodes(
    cluster_id, db, active_nodes,
    edge_data, resource_type,
    edge_format_fn=None,
    log_operation_fn=None,
    encrypt=True
) -> list[dict]:
    """统一的Edge节点同步模式，替代12次重复的 for node + EdgeClient + edge_logger"""
```

### 3. 抽取 plugins.py 数据

将插件定义从路由文件移到 `backend/app/config/plugin_definitions.py`，`plugins.py` 只留路由。

### 4. 修复 useClusterNodes.ts

将 `deleteNode` 中的内联 API 调用替换为 `executeDeleteWithProgress`，与其他5个composable保持一致。

## Decisions

| 决策 | 方案 | 理由 |
|------|------|------|
| 子路由挂载 | 主 router 统一 include_router | 不改变 URL 路径 |
| edge_sync 参数 | 显式参数而非泛型 | 可读性优先 |
| 文件拆分顺序 | 先抽 edge_sync，再拆分文件 | 确保拆分时可直接引用新共享函数 |
