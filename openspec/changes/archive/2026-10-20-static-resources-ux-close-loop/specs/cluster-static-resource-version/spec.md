# cluster-static-resource-version Delta

## MODIFIED Requirements

### Requirement: 版本列表查看

用户 SHALL 能够查看静态资源的所有历史版本。

#### Scenario: 查看版本历史
- **WHEN** 用户点击版本管理按钮
- **THEN** 弹窗展示所有历史版本列表
- **AND** 每项显示版本号、文件大小、发布时间、发布状态

#### Scenario: 版本详情不暴露服务器路径与内部标识
- **WHEN** 用户查看静态资源某版本的配置详情（config JSON）
- **THEN** 详情 SHALL NOT 展示 `file_path`（服务器文件系统路径）与 `route_id`/`edge_uuid`（平台内部标识）
- **AND** 该裁剪 SHALL 仅作用于展示层（ConfigVersion.config 中的 `file_path` SHALL 保留，回滚 `_restore` 依赖其定位历史文件）
- **AND** 其它资源类型的版本详情展示 SHALL NOT 受影响（裁剪以可选参数表达）
