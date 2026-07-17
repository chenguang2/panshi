## MODIFIED Requirements

### Requirement: Single node restart (reload)
The system SHALL support reloading the process configuration via `POST /clusters/{cluster_id}/nodes/{node_id}/restart`. Tag: `nginx_cmd_run`, extravar: `nginx_cmd: nginx_reload`.

前端 SHALL 在节点操作栏中显示"⟳ reload"按钮，替代原有"ⓘ 详情"按钮的位置。详情按钮移入更多菜单，放在编辑上方。

#### Scenario: 点击 reload 按钮
- **WHEN** 用户在节点操作栏点击"⟳ reload"
- **AND** 弹出确认对话框，确认后执行 reload
- **THEN** 系统 SHALL 调用 `POST /clusters/{cluster_id}/nodes/{node_id}/reload`
- **AND** 后端 `/reload` SHALL 执行 `nginx_cmd: nginx_reload` 与 `/restart` 一致
- **AND** 前端 SHALL 显示 SSE 流式执行结果

#### Scenario: 点击详情按钮
- **WHEN** 用户在更多菜单中点击"ⓘ 详情"
- **THEN** SHALL 弹出节点详情对话框
