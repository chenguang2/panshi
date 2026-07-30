## Context

当前 `publish_static_resource` 直接遍历 Edge 节点，使用 `EdgeClient.raw_put()` 上传 zip 文件，没有调用 `edge_sync.publish_to_nodes()`，因此缺少发布操作的 Edge 日志。其他资源类型（路由、上游、插件组等）均使用 `publish_to_nodes()` 并传入 `log_fn` 回调记录日志。

静态资源发布的特殊性在于：它传输的是二进制 zip 数据而非 JSON 配置，因此无法复用 `publish_to_nodes()` 的加密流程（`client._encrypt(json.dumps(edge_data).encode())`），需要直接使用 `raw_put`。

## Goals / Non-Goals

**Goals:**
- 静态资源发布时，每次向 Edge 节点发送 zip 文件的请求和结果都记录到 `logs/edge/static_resource.log`
- 日志格式与其他资源发布日志保持一致（时间戳、集群信息、资源名称、请求方法/PATH、状态码、Status）
- 复用现有的 `EdgeLogger.log_publish_result()` 方法

**Non-Goals:**
- 不重构 `publish_static_resource` 的发布流程（仍使用 `raw_put` 直接传输 zip）
- 不修改日志格式或日志系统架构
- 不涉及前端变更

## Decisions

**Decision 1: 直接在 publish_static_resource 中调用 get_edge_logger() 记录日志**
- 替代方案 A：将 `publish_static_resource` 改为使用 `publish_to_nodes()` — 但 `publish_to_nodes` 对 edge_data 强制进行 JSON 序列化和加密，不适合二进制 zip 传输
- 替代方案 B：扩展现有的 `publish_to_nodes` 支持二进制 payload — 改动较大且影响现有逻辑
- **选择理由**：静态资源的二进制传输是特殊情况，直接调用 logger 更简单、侵入性更小

**Decision 2: 复用 `EdgeLogger.log_publish_result()` 方法**
- 该方法已处理 SUCCESS/FAILED 两种状态、错误信息格式、时间戳等
- 在 `RESOURCE_LOG_CONFIG` 中新增 `static_resource` 条目，自动路由到 `logs/edge/static_resource.log`
- 需要额外查询 `Cluster` 获取 `cluster_name`（其他 publish 函数均有此查询）

**Decision 3: `log_publish_result` 的 `request_body` 参数传 `None`**
- 静态资源传输的是二进制 zip 数据，不适合记录到日志中
- 其他资源类型记录的是 JSON 配置结构体，数据量小且可读
- `encrypted_body` 也传 `None`，因为 `raw_put` 不做 SM4 加密

## Risks / Trade-offs

- [日志与业务逻辑耦合] → 当前所有资源类型的发布日志都是在业务代码中直接调用 logger，静态资源保持一致风格即可
- [`raw_put` 返回 `dict`] → `raw_put` 返回的是解析后的 `dict`，可直接传入 `log_publish_result(response_body=response)`。如果 Edge 返回的是无法解析的非 JSON 响应，`raw_put` 会用 `{"raw_response": response.text}` 兜底，因此 `response_body` 始终是 dict 类型
- [异常时 `path` 变量的作用域] → 如果 `EdgeClient()` 构造或 `raw_put()` 调用抛出异常，`path` 变量尚未定义。实现时需将 `path` 的计算放在 `try` 块之前

## 实现细节

### `publish_static_resource` 中日志调用的参数映射

```python
# 在函数开头获取 cluster_name
cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
cluster = cluster_result.scalar_one_or_none()

# 获取 logger
edge_logger = get_edge_logger()

# 遍历节点时，path 提前计算
edge_uuid = resource.edge_uuid or ""
path = f"/edge/panshi/admin_static_resources?edge_uuid={edge_uuid}"

for node in nodes:
    try:
        client = EdgeClient(...)
        response = client.raw_put(path, zip_data)

        results.append(...)

        edge_logger.log_publish_result(
            resource_type="static_resource",
            cluster_id=cluster_id,
            cluster_name=cluster.name if cluster else str(cluster_id),
            resource_id=resource.id,
            resource_name=resource.name,
            method="PUT",
            path=path,
            request_body=None,       # 二进制 zip，不记录
            encrypted_body=None,     # raw_put 不做加密
            response_status=200,
            response_body=response,
            error=None,
        )
    except (EdgeConnectionError, EdgeAPIError) as e:
        results.append(...)

        edge_logger.log_publish_result(
            resource_type="static_resource",
            cluster_id=cluster_id,
            cluster_name=cluster.name if cluster else str(cluster_id),
            resource_id=resource.id,
            resource_name=resource.name,
            method="PUT",
            path=path,
            request_body=None,
            encrypted_body=None,
            response_status=getattr(e, 'status_code', None),
            response_body=getattr(e, 'response_body', None),
            error=e,
        )
```
