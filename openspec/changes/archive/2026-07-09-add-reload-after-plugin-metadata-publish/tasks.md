## 1. 共享发布服务 — 扩展 publish_to_nodes

- [x] 1.1 `edge_sync.publish_to_nodes()` 新增 `post_publish_fn` 参数：publish 成功后调用
- [x] 1.2 新增 `post_log_fn` 参数：记录 post_publish 的调用结果到日志

## 2. 插件元数据发布 — 接入 reload

- [x] 2.1 `cluster_plugin_metadata.py` publish 端点传入 `post_publish_fn=lambda client: client.reload_plugins()`
- [x] 2.2 传入 `post_log_fn` 记录 reload 调用到 Edge 日志

## 3. 验证

- [x] 3.1 语法检查通过
