## Purpose

Edge 节点端静态资源 Admin API 处理功能。

## Requirements

### Requirement: zip 格式校验

Edge 节点 Admin API SHALL 在接收上传文件时检查 zip 格式的有效性。

#### Scenario: 上传有效 zip 文件
- **WHEN** 客户端 PUT 上传一个以 `PK\x03\x04` 开头的有效 zip 文件
- **THEN** 系统接收并解压文件

#### Scenario: 上传非 zip 文件
- **WHEN** 客户端 PUT 上传一个不是 zip 格式的文件
- **THEN** 系统拒绝上传，返回 400 错误和格式错误提示

### Requirement: 解压结果校验

Edge 节点 Admin API SHALL 在解压完成后验证目标目录内容，空目录视为无效。

#### Scenario: 解压出空目录
- **WHEN** 上传的 zip 文件解压后目标目录为空
- **THEN** 系统返回 400 错误，提示压缩包内容为空

### Requirement: shell 命令安全

Edge 节点 Admin API SHALL 对传递给 shell 命令的路径参数进行安全转义。

#### Scenario: 路径含特殊字符
- **WHEN** 资源名称或路径包含空格、单引号等特殊字符
- **THEN** shell 命令中的路径参数被正确转义，不执行意外命令
