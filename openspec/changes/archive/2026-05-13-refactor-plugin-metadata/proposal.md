## Why

插件元数据原有的流程逻辑与上游/路由/插件组不一致：表名不同、版本管理用专用表而非通用 ConfigVersion、发布不调 Edge API、删除不级联。

## What Changes

- 模型 `ClusterPluginMetadata` → `PluginMetadata`，表名 `ps_cluster_plugin_metadata` → `ps_plugin_metadata`
- 版本管理从 `PluginMetadataVersion` 改为通用 `ConfigVersion`
- 发布改为调 EdgeClient 推送到 Edge 节点
- 删除增加级联 + Edge 节点同步
- 添加 `metadata_schema` 支持（log_process 元数据专属字段）
