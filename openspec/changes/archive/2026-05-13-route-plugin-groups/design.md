## Decisions

- `plugin_config_ids` 以 JSON 数组形式存储在 `ps_route.plugin_config_ids`（Text 列）
- 路由弹窗新增独立 Tab 展示插件组卡片，和插件管理 Tab 并列
- 发布时 `plugin_config_ids` 跟随 config_data 保存到 ConfigVersion，跟随 edge_data 发送到 Edge 节点
- 集群卡片插件标签点击弹出 Modal.info 显示 JSON 配置，和路由弹窗行为一致
