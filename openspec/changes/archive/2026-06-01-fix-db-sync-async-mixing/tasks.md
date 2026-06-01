## 1. 基础设施

- [x] 1.1 core/database.py — 删除 SyncSessionLocal，导出 get_sync_engine()
- [x] 1.2 services/edge_client.py — db 参数改为 Optional，_resolve_edge_url 加 None 保护

## 2. EdgeClient 调用方修正

- [x] 2.1 cluster_routes.py — EdgeClient 不传 db
- [x] 2.2 cluster_nodes.py — 同上
- [x] 2.3 cluster_global_rules.py — 同上 + delete_on_nodes 少传 db
- [x] 2.4 cluster_plugin_metadata.py — 同上
- [x] 2.5 cluster_plugin_configs.py — 同上 + delete_on_nodes 少传 db
- [x] 2.6 cluster_upstreams.py — 同上 + delete_on_nodes 少传 db
- [x] 2.7 clusters.py — EdgeClient 不传 db
- [x] 2.8 edge_client.py (API) — 移除无用 sync_db 调用

## 3. 独立修复

- [x] 3.1 edge_sync.py — delete_on_nodes 移除 db 参数
- [x] 3.2 cluster_static_resources.py — 移除冗余 sync DB 查询
- [x] 3.3 edge_import_service.py — async factory 替代 sync __init__
- [x] 3.4 core/database.py — 移除 _sync_engine 模块级变量，init_db 内联临时 engine

## 4. 测试修复

- [x] 4.1 edge_logger.py — _write_log 自动创建目录，支持实例属性覆盖
- [x] 4.2 test_edge_client_api.py — 添加 503 到预期状态码
- [x] 4.3 edge_client.py — priority=0 时跳过

## 5. 等价规则

- [x] 5.1 equivalence_rules.yaml — auth_basic 和 cors 补充默认字段
