## ADDED Requirements

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
- **THEN** 系统删除 `static_resources` 和 ConfigVersion 相关记录
- **AND** 清理管理端本地文件（zip 文件及目录）
- **AND** Edge 节点上的文件不受影响

#### Scenario: 仅删除 Edge 节点文件
- **WHEN** 用户仅勾选"同时删除 Edge 节点文件"
- **THEN** 系统不操作数据库
- **AND** 遍历所有活跃 Edge 节点，调用 `DELETE /edge/panshi/admin_static_resources?edge_uuid={edge_uuid}`
- **AND** 不经过 SM4 加密，使用 raw_delete 直连
- **AND** Edge 节点 handler 从 query 参数读取 edge_uuid 并清理对应目录
- **AND** 弹窗展示每节点删除结果

#### Scenario: 同时删除数据库和 Edge 节点文件
- **WHEN** 用户同时勾选两个选项
- **THEN** 先执行数据库删除（清理本地文件）
- **AND** 再遍历 Edge 节点调用 DELETE 接口
- **AND** edge_uuid 通过 query 参数传递
