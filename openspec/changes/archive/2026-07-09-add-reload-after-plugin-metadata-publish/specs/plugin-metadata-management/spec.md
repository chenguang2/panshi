# plugin-metadata-management

## MODIFIED Requirements

### Requirement: 发布插件元数据

用户 SHALL 能够将插件元数据发布到集群的 Edge 节点。

发布后后端 SHALL 自动调用 `PUT /edge/admin/plugins/reload` 触发 Edge 节点重载插件，使元数据立即生效。

#### Scenario: 发布流程
- **WHEN** 用户点击卡片上的"发布"按钮
- **THEN** 弹出 `PublishConfirmModal` 选择目标节点
- **AND** 确认后调用 publish API
- **AND** 后端将插件元数据推送到 Edge 节点
- **AND** 推送成功后自动调用插件 reload 接口（`PUT /edge/admin/plugins/reload`）
- **AND** reload 调用结果记录到 Edge 日志
- **AND** 前端显示进度和节点同步结果

#### Scenario: 日志记录 reload 调用
- **WHEN** 发布插件元数据到 Edge 节点后
- **THEN** 日志中 SHALL 包含两次 API 调用的记录：
  - `PUT /edge/admin/plugin_metadata/{name}` — 推送元数据
  - `PUT /edge/admin/plugins/reload` — 重载插件
