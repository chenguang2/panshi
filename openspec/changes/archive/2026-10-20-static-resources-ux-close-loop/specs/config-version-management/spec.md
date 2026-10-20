# config-version-management Delta

## ADDED Requirements

### Requirement: 版本详情配置展示裁剪服务器路径

版本管理弹窗（`VersionManagementModal`，全部资源类型共享）SHALL 支持按资源域可选裁剪 config 详情中的内部字段；裁剪仅作用于展示层，SHALL NOT 影响存储数据（回滚依赖的 `file_path` 等字段必须继续存于 ConfigVersion.config）。

#### Scenario: 静态资源版本详情不含服务器路径
- **WHEN** 从静态资源任一入口打开版本管理弹窗并查看版本详情
- **THEN** config JSON 展示 SHALL NOT 含 `file_path`、`route_id`、`edge_uuid`
- **AND** 版本回滚 SHALL 仍正常工作（存储层字段未动）

#### Scenario: 其它资源域不受影响
- **WHEN** 未传裁剪参数的资源域打开版本管理弹窗
- **THEN** config 详情展示 SHALL 与现状完全一致
