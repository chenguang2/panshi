## 1. 配置规则文件 — 插件元数据忽略 id

- [x] 1.1 `equivalence_rules.yaml` 新增 `plugin_metadata.ignore_edge_fields: [id]`

## 2. 插件元数据对比改用规则文件

- [x] 2.1 `_compare_plugin_metadata` 中遍历 `_rules._res_type("plugin_metadata").get("ignore_edge_fields", [])` 并从 `edge_config` 中 pop

## 3. EdgeClient 新增 list_ssl 方法

- [x] 3.1 `EdgeClient` 新增 `list_ssl(self) -> list[dict[str, Any]]`，实现为 `return self.api("ssl", "list")`

## 4. SSL 证书对比

- [x] 4.1 diff 端点 DB 查询部分增加 `db_ssl_certificates = await _get_all(SslCertificate, cluster_id=cluster_id)`
- [x] 4.2 Edge 数据拉取部分增加 SSL 数据获取（`client.list_ssl()`），try/except 兜底
- [x] 4.3 实现 `_normalize_edge_sni(edge_data)` 归一化 `sni`/`snis` 为逗号字符串
- [x] 4.4 实现 `_compare_ssl_certificate(db_cert, edge_data)` 逐字段对比
- [x] 4.5 在 diff 分组中增加 SSL 证书分组（`_add_group("SSL 证书", "ssl_certificates", ssl_items)`）
