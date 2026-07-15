## 1. Stats 端点增加计数

- [x] 1.1 `GET /{cluster_id}/stats` 增加 `stream_proxies` 和 `ssl_certificates` 计数

## 2. EdgeClient 新增 delete_ssl 方法

- [x] 2.1 EdgeClient 新增 `delete_ssl(self, cert_id: str)`，与现有 `delete_<资源名>` 模式一致

## 3. 删除集群 — Edge 侧

- [x] 3.1 查询 StreamProxy 和 SslCertificate 列表
- [x] 3.2 Edge 遍历删除四层代理（`client.delete_stream_route(uuid)`）和 SSL 证书（`client.delete_ssl(uuid)`）
- [x] 3.3 Edge 删除结果 detail 增加对应计数

## 4. 后端 Model — SslCertificate 补充外键

- [x] 4.1 `models/ssl.py` 中 `cluster_id` 增加 `ForeignKey("ps_cluster.id", ondelete="CASCADE")`
- [x] 4.2 同步更新数据库迁移脚本（`migrate.py` 新增 `_ensure_ssl_foreign_key` 检测+告警）

## 5. 删除集群 — DB 侧

- [x] 5.1 DB 删除 StreamProxy 和 SslCertificate 记录
- [x] 5.2 DB 删除结果 detail 增加对应计数
- [x] 5.3 ConfigVersion 已按 cluster_id 批量删除，SSL 和四层代理的版本历史自动被覆盖（无需改动）

## 6. 前端资源标签

- [x] 6.1 `resourceLabels` 增加 `stream_proxies: '四层代理'` 和 `ssl_certificates: 'SSL 证书'`
- [x] 6.2 `executeDeleteWithProgress` 的 labels 映射表增加 `stream_proxies` 和 `ssl_certificates`
