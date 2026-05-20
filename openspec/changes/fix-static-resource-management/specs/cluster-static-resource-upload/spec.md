## ADDED Requirements

### Requirement: 上传 zip 并关联路由

用户 SHALL 能够选择一个路由并上传 zip 文件，系统校验后保存到管理端文件系统并记录到数据库。

#### Scenario: 成功上传
- **WHEN** 用户选择一个已加载 `static_resource` 插件的路由并上传有效 zip 文件
- **THEN** 系统校验 zip 格式（魔数 `PK\x03\x04`）
- **AND** 系统将 zip 保存到 `{base}/static/{route_id}/{version}.zip`
- **AND** 系统创建 `static_resources` 记录和 `static_resource_versions` 记录

#### Scenario: 路由未加载 static_resource 插件
- **WHEN** 用户选择的路由未加载 `static_resource` 插件
- **THEN** 系统提示"静态资源路由必须加载 static_resource 插件"，拒绝上传

#### Scenario: 路由 URI 不以 * 结尾
- **WHEN** 用户选择的路由 URI 最后一个字符不是 `*`
- **THEN** 系统提示"路由路径必须以 * 结尾"，拒绝上传

#### Scenario: 上传非 zip 文件
- **WHEN** 用户上传非 zip 格式的文件
- **THEN** 系统拒绝上传并提示格式错误

### Requirement: zip 文件存储

上传的 zip 文件 SHALL 存储在管理端本地文件系统固定目录下。

#### Scenario: 文件路径格式
- **WHEN** 上传成功
- **THEN** zip 文件存储在 `{base}/static/{route_id}/{version}.zip`
- **AND** 数据库记录文件路径

#### Scenario: 目录不存在时自动创建
- **WHEN** `{base}/static/{route_id}/` 目录不存在
- **THEN** 系统自动创建该目录
