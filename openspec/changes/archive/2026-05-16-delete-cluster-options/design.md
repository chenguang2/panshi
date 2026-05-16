## Context

当前删除集群的 API `DELETE /clusters/{cluster_id}` 无请求体，强制执行两个操作：
1. 删除数据库中的所有关联记录（上游、路由、插件组、全局规则、节点等）
2. 同步删除所有活跃 Edge 节点上的对应配置

用户需要更灵活的控制。

## Goals / Non-Goals

**Goals:**
- 在删除确认弹窗中增加两个 checkbox："数据库"和"Edge 节点"
- 后端根据参数决定是否执行数据库删除和/或 Edge 同步
- 默认都不选，确认按钮禁用

**Non-Goals:**
- 不改变删除流程的其他逻辑
- 不影响资源统计弹窗的显示

## Decisions

### 1. API 设计：请求体 vs 查询参数

- 使用请求体 `DELETE` + body（FastAPI 支持 `DELETE` 带 body）
- 请求体：`{ "delete_db": false, "delete_edge": false }`

### 2. 后端逻辑

```python
@router.delete("/{cluster_id}")
async def delete_cluster(cluster_id: int, body: DeleteClusterRequest, db: ...):
    if body.delete_db:
        # 删除 DB 记录（现有逻辑）
        ...
    if body.delete_edge:
        # 同步删除 Edge 节点（现有逻辑）
        ...
    return {"message": ...}
```

### 3. 前端行为

- 确认弹窗增加两个 `<a-checkbox>`：`deleteDb` 和 `deleteEdge`
- 确认按钮：`disabled` 当 `!deleteDb && !deleteEdge`
- API 调用：`api.delete('/clusters/${id}', { data: { delete_db, delete_edge } })`

## API 设计

```
DELETE /api/v1/clusters/{cluster_id}
请求体: { "delete_db": bool, "delete_edge": bool }
响应: 不变
```
