## Purpose

集群管理页静态资源删除功能。

## Requirements

### Requirement: 删除静态资源

用户 SHALL 能够删除静态资源，可选择仅删除数据库记录或同时删除 Edge 节点文件。

#### Scenario: 删除弹窗选项
- **WHEN** 用户点击删除按钮
- **THEN** 弹出确认弹窗，包含两个选项：
  - "删除数据库记录"（必选，默认勾选）
  - "同时删除 Edge 节点文件"（可选）
- **WHEN** 用户确认删除
- **THEN** 根据选项执行对应操作
- **AND** 清理管理端本地 zip 文件

#### Scenario: 仅删除数据库
- **WHEN** 用户仅勾选"删除数据库记录"
- **THEN** 系统删除 `static_resources` 和相关 ConfigVersion 记录
- **AND** 清理管理端本地文件
- **AND** Edge 节点上的文件不受影响

#### Scenario: 同时删除 Edge 节点文件
- **WHEN** 用户同时勾选"删除 Edge 节点文件"
- **THEN** 系统先删除数据库记录
- **AND** 调用 `DELETE /edge/panshi/admin_static_resources` 通知 Edge 节点清理文件
- **AND** 弹窗展示每节点删除结果
