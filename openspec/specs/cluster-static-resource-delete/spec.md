## Purpose

集群管理页静态资源删除功能。

## Requirements

### Requirement: 删除静态资源

用户 SHALL 能够删除静态资源，可选择仅删除数据库记录、仅删除 Edge 节点文件、或两者同时删除。

#### Scenario: 删除弹窗选项
- **WHEN** 用户点击删除按钮
- **THEN** 弹出确认弹窗，包含两个独立选项：
  - "删除数据库记录"（可选，默认勾选）
  - "同时删除 Edge 节点文件"（可选）
- **WHEN** 用户确认删除
- **THEN** 根据选项执行对应操作
- **AND** 两个选项互不依赖，可以单独选择任意一个

#### Scenario: 仅删除数据库
- **WHEN** 用户仅勾选"删除数据库记录"
- **THEN** 系统删除 `static_resources` 和相关 ConfigVersion 记录
- **AND** 清理管理端本地文件
- **AND** Edge 节点上的文件不受影响

#### Scenario: 仅删除 Edge 节点文件
- **WHEN** 用户仅勾选"同时删除 Edge 节点文件"
- **THEN** 系统遍历所有活跃 Edge 节点
- **AND** 调用 `DELETE /edge/panshi/admin_static_resources/{edge_uuid}`
- **AND** 不操作数据库
- **AND** 弹窗展示每节点删除结果

#### Scenario: 同时删除数据库和 Edge 节点文件
- **WHEN** 用户同时勾选两个选项
- **THEN** 先执行数据库删除（清理本地文件）
- **AND** 再遍历 Edge 节点调用 DELETE 接口
- **AND** 弹窗展示每节点删除结果
- **AND** 日志根据选项条件显示，未选择的操作不展示
