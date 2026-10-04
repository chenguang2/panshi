# cluster-static-resource-upload Delta

## MODIFIED Requirements

### Requirement: 上传 zip 并关联路由

用户 SHALL 能够选择一个路由并上传 zip 文件，系统校验后保存到管理端文件系统并记录到数据库。上传体积 SHALL 受 32MB 上限约束，前端选择期拦截与后端校验 SHALL 构成双防线。

#### Scenario: 成功上传
- **WHEN** 用户选择一个已加载 `static_resource` 插件的路由并上传有效 zip 文件
- **THEN** 系统校验 zip 格式（魔数 `PK\x03\x04`）
- **AND** 系统将 zip 保存到 `{base}/static/{edge_uuid}/{version}.zip`
- **AND** 系统创建 `static_resources` 记录和 ConfigVersion 记录

#### Scenario: 路由未加载 static_resource 插件
- **WHEN** 用户选择的路由未加载 `static_resource` 插件
- **THEN** 系统提示"静态资源路由必须加载 static_resource 插件"，拒绝上传

#### Scenario: 路由 URI 不以 /* 结尾
- **WHEN** 用户选择的路由 URI 最后一个字符不是 `*`
- **THEN** 系统提示"路由路径必须以 /* 结尾"，拒绝上传

#### Scenario: 路由未发布到 Edge 节点
- **WHEN** 用户选择的路由未发布到 Edge 节点
- **THEN** 系统提示"路由必须先发布到 Edge 节点"，拒绝上传

#### Scenario: 上传非 zip 文件
- **WHEN** 用户上传非 zip 格式的文件
- **THEN** 系统拒绝上传并提示格式错误

#### Scenario: 超过 32MB 上限被双防线拒绝
- **WHEN** 用户选择或上传超过 32MB 的 zip（含绕过前端直接调用后端的情况）
- **THEN** 前端 SHALL 在文件选择期即提示超限、不发起上传
- **AND** 后端 SHALL 独立校验体积并拒绝超限请求，前端防线被绕过时后端防线仍生效
