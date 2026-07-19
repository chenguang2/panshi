## 1. 后端：注册 log_process_stream 插件定义

- [ ] 1.1 在 `backend/app/config/plugin_definitions.py` 中新增 `log_process_stream` 插件条目，复制 `log_process` 的 schema 和 metadata_schema，修改 name/display_name/description
- [ ] 1.2 更新 `backend/features.yaml` 的 `enabled_plugins` 列表，加入 `log_process_stream`
- [ ] 1.3 更新 `product/features.yaml` 的 `enabled_plugins` 列表，同步加入

## 2. 后端：EdgeClient 新增 Stream 资源路径

- [ ] 2.1 在 `RESOURCE_PATHS` 中增加 `"stream_plugin_metadata": "/stream/edge/admin/plugin_metadata"`
- [ ] 2.2 增加 `"stream_plugin": "/stream/edge/admin/plugins"`

## 3. 后端：EdgeClient 方法加 stream 参数 + 新增方法

- [ ] 3.1 `create_plugin_metadata` 增加 `stream=False` 参数，内部选择 resource
- [ ] 3.2 `delete_plugin_metadata` 增加 `stream=False` 参数
- [ ] 3.3 `get_plugin_metadata` 增加 `stream=False` 参数
- [ ] 3.4 `update_plugin_metadata` 增加 `stream=False` 参数
- [ ] 3.5 新增 `reload_stream_plugins()`（`PUT /stream/edge/admin/plugins/reload`）
- [ ] 3.6 新增 `list_stream_plugin_metadata()`（`GET /stream/edge/admin/plugin_metadata`，返回格式用 `_parse_resource_list` 对齐）

## 4. 后端：发布/删除逻辑适配

- [ ] 4.1 `publish_plugin_metadata`：根据 `_stream` 后缀传 `stream=True`，Edge URL 中去掉 `_stream` 后缀
- [ ] 4.2 发布日志路径（EdgeLogger）根据 `_stream` 后缀使用 `/stream/edge/admin/` 或 `/edge/admin/`
- [ ] 4.3 发布后重载根据 `_stream` 后缀选择 `reload_stream_plugins()` 或 `reload_plugins()`
- [ ] 4.4 `delete_plugin_metadata`（Edge 删除）：根据 `_stream` 后缀传 `stream=True`

## 5. 后端：集群删除适配

- [ ] 5.1 修改 `clusters.py` 中删除集群时的 `delete_plugin_metadata` 调用：根据 `pm.plugin_name` 后缀传 `stream=True`

## 6. 后端：导入适配

- [ ] 6.1 在 `edge_import_service.py` 的 `fetch_edge_data` 中增加读取 `/stream/edge/admin/plugin_metadata`
- [ ] 6.2 修改 `convert_plugin_metadata`：检测 key 含 `/stream/` 时追加 `_stream` 后缀
- [ ] 6.3 合并入 `plugin_metadata` 列表，统一冲突检测和保存

## 7. 后端：Config diff 适配

- [ ] 7.1 修改 `cluster_nodes.py` 的 config diff 流程：额外拉取 Stream 端点元数据
- [ ] 7.2 以 `plugin_name + "_stream"` 为 key 合入 `edge_plugin_metadatas` 字典

## 8. 测试

- [ ] 8.1 验证 `log_process_stream` 插件定义正确加载（不报错）
- [ ] 8.2 验证白名单过滤后 `log_process_stream` 在可用插件列表中
