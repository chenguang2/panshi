## 1. 后端日志配置

- [x] 1.1 `backend/app/services/edge_logger.py`: 在 `RESOURCE_LOG_CONFIG` 中新增 `static_resource` 条目，`file` 指向 `logs/edge/static_resource.log`，label 格式为 `StaticResource:{name} (ID:{id})`

## 2. 后端发布日志实现

- [x] 2.1 `backend/app/api/v1/cluster_static_resources.py`: 在文件顶部添加 import `from app.services.edge_logger import get_edge_logger`
- [x] 2.2 `backend/app/api/v1/cluster_static_resources.py`: 在 `publish_static_resource` 函数开头查询 `Cluster` 获取 `cluster_name`（`cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))` / `cluster = cluster_result.scalar_one_or_none()`）
- [x] 2.3 `backend/app/api/v1/cluster_static_resources.py`: 在节点遍历 loop 之前获取 `edge_logger = get_edge_logger()`，并将 `path = f"/edge/panshi/admin_static_resources?edge_uuid={resource.edge_uuid or ''}"` 提前到 `try` 块外计算
- [x] 2.4 `backend/app/api/v1/cluster_static_resources.py`: 在节点遍历 loop 的 `try` 块中捕获 `raw_put` 返回值，成功后调用 `edge_logger.log_publish_result(resource_type="static_resource", cluster_id=..., cluster_name=..., resource_id=resource.id, resource_name=resource.name, method="PUT", path=path, request_body=None, encrypted_body=None, response_status=200, response_body=response, error=None)`
- [x] 2.5 `backend/app/api/v1/cluster_static_resources.py`: 在 `except` 块中调用 `edge_logger.log_publish_result(resource_type="static_resource", ..., error=e)`，利用 `getattr(e, 'status_code', None)` 和 `getattr(e, 'response_body', None)` 提取异常中的响应信息
