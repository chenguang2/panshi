## Purpose

静态资源的上传、发布、删除和版本管理功能。

## Requirements

### Requirement: 静态资源上传

用户 SHALL 能够上传一个 zip 格式的静态资源压缩包，并为其指定名称和 URL 访问路径。上传后系统自动解压并准备发布。

#### Scenario: 成功上传
- **WHEN** 用户上传一个有效的 zip 文件并填写名称和 URL 路径
- **THEN** 系统保存静态资源元数据，返回资源 ID

#### Scenario: 上传非 zip 文件
- **WHEN** 用户上传非 zip 格式的文件
- **THEN** 系统拒绝上传并提示格式错误

### Requirement: 静态资源发布

用户 SHALL 能够发布静态资源，将 zip 内容分发到集群中所有活跃 Edge 节点。

#### Scenario: 发布到活跃节点
- **WHEN** 用户点击发布按钮
- **THEN** 系统解压 zip，将文件通过 Admin API 分发到每个活跃 Edge 节点
- **AND** 系统在 Edge 节点上创建对应的路由（`uri: /static/{name}/*plugin: static_resource`）

#### Scenario: 发布结果展示
- **WHEN** 发布完成
- **THEN** 系统展示每个节点的同步状态（成功/失败）
- **AND** 系统记录版本号到 ConfigVersion

### Requirement: 静态资源删除

用户 SHALL 能够删除已创建的静态资源，系统自动清理 Edge 节点上的文件和相关路由。

#### Scenario: 删除静态资源
- **WHEN** 用户确认删除一个静态资源
- **THEN** 系统从各 Edge 节点删除对应目录和路由

### Requirement: 静态资源版本管理

每次发布 SHALL 生成新版本号，并记录到 ConfigVersion 表中，支持查看历史版本。

#### Scenario: 查看版本历史
- **WHEN** 用户查看静态资源的版本管理
- **THEN** 展示所有历史版本、发布时间和发布结果

### Requirement: 静态资源管理页面

静态资源管理页面 SHALL 独立于集群上下文，提供全局视图。

#### Scenario: 卡片网格展示
- **WHEN** 存在静态资源
- **THEN** 每个资源 SHALL 以卡片形式在 3 列网格中展示
- **THEN** 每张卡片 SHALL 显示：名称、路径、描述、文件信息、操作按钮

#### Scenario: 创建/编辑
- **WHEN** 管理员点击"添加静态资源"或"编辑"
- **THEN** StaticResourceFormModal SHALL 打开
- **THEN** "所属集群" SHALL 出现在表单中

#### Scenario: 操作
- **WHEN** 管理员点击操作按钮
- **THEN** SHALL 使用与集群管理相同的函数
