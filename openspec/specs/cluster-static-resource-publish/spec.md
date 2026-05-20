## Purpose

集群管理页静态资源发布到 Edge 节点功能。

## Requirements

### Requirement: 发布到 Edge 节点

用户 SHALL 能够将静态资源 zip 文件发布到所选 Edge 节点。

#### Scenario: 选择节点并发布
- **WHEN** 用户点击发布按钮
- **THEN** 弹出目标节点选择弹窗（类似插件组发布），默认勾选所有活跃节点
- **WHEN** 用户确认发布
- **THEN** 系统遍历所选节点，调用 `PUT /edge/panshi/admin_static_resources` 发送 zip 文件
- **AND** 弹窗展示实时进度日志和每节点同步状态

#### Scenario: 发布成功
- **WHEN** 所有节点同步成功
- **THEN** 进度条显示绿色成功，记录版本号到数据库

#### Scenario: 部分节点失败
- **WHEN** 部分节点同步失败
- **THEN** 进度条显示红色异常，展示失败节点及其错误信息
- **AND** 记录当前版本的发布结果到数据库

### Requirement: 弹窗选择节点

发布弹窗 SHALL 复用现有插件组的节点选择模式。

#### Scenario: 节点列表
- **WHEN** 打开发布弹窗
- **THEN** 显示集群中所有活跃节点，默认全选
- **AND** 用户可以取消勾选不想发布的节点
