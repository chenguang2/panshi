## Context

集群删除端点 `DELETE /clusters/{cluster_id}` 负责清理集群及其关联资源。当前已处理：Route、Upstream、PluginConfig、GlobalRule、PluginMetadata、Node、ConfigVersion。未处理：StreamProxy、SslCertificate。

Stats 端点 `GET /clusters/{cluster_id}/stats` 同样缺少这两类资源的计数。

ConfigVersion 已有 `cluster_id` 维度的批量删除（`ConfigVersion.__table__.delete().where(ConfigVersion.cluster_id == cluster_id)`），四层代理和 SSL 证书的 `ConfigVersion` 记录同样关联 `cluster_id`，因此版本历史记录已自动被覆盖，无需额外处理。

## Goals / Non-Goals

**Goals:**
- 删除集群时一并删除四层代理（StreamProxy）和 SSL 证书（SslCertificate）
- Stats 端点返回这两类资源的计数
- 前端资源统计标签增加对应中文名

**Non-Goals:**
- 不改动其他资源的删除逻辑
- 不新增前端界面元素

## Decisions

### 1. 实现方式

完全复用现有模式，每个资源类型在三个位置各加一段代码：

- **Stats 端点**：`await count(StreamProxy, cluster_id=cluster_id)` + `await count(SslCertificate, cluster_id=cluster_id)`
- **Edge 删除**：查询 `StreamProxy`/`SslCertificate` → 遍历 `client.delete_stream_route(uuid)` / `client.delete_ssl(uuid)`
- **DB 删除**：`await db.execute(StreamProxy.__table__.delete().where(...))` + `await db.execute(SslCertificate.__table__.delete().where(...))`

### 2. EdgeClient 方法

`delete_stream_route` 已存在。SSL 按现有 `delete_<资源名>` 模式新增 `delete_ssl` 方法：

```python
def delete_ssl(self, cert_id: str) -> dict[str, Any]:
    return self.api("ssl", "delete", cert_id)
```

### 3. SslCertificate 补充外键约束

`SslCertificate.cluster_id` 当前为普通 `Integer`，无外键约束。补充 `ForeignKey("ps_cluster.id", ondelete="CASCADE")`，与 `models/cluster.py` 中其他资源保持一致。需同步更新数据库迁移。

### 4. 版本历史记录（ConfigVersion）

ConfigVersion 已按 `cluster_id` 批量删除，SSL 和四层代理的 ConfigVersion 记录（`resource_type="ssl"` / `resource_type="stream_proxy"`）同样包含在内，无需额外操作。

## Risks / Trade-offs

- 无新增风险，与现有资源删除模式完全一致。
