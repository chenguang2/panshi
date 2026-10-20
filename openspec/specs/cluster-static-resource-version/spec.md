## Purpose

集群管理页静态资源版本管理功能。

## Requirements

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
### Requirement: 版本回滚

用户 SHALL 能够将静态资源回滚到指定历史版本并重新发布。

#### Scenario: 回滚到指定版本
- **WHEN** 用户在版本列表中选择一个历史版本并点击回滚
- **THEN** 系统将该历史版本的 zip 文件设置为当前版本
- **AND** 用户可以再次发布该版本到 Edge 节点
