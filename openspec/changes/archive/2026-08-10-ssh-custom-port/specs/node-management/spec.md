# Node Management

## ADDED Requirements

### Requirement: 自定义 SSH 端口

节点 SHALL 支持配置自定义 SSH 端口（非 22），所有远程 SSH 操作（安装 OpenResty、软件查询、命令执行等）SHALL 使用该端口连接。

#### Scenario: 节点配置 SSH 端口
- **WHEN** 用户创建或编辑节点并填写 SSH 端口（如 1122）
- **THEN** 节点保存后 SHALL 持久化 `ssh_port` 字段
- **WHEN** 未填写 SSH 端口
- **THEN** 默认 SHALL 使用 22（与现状一致）

#### Scenario: 远程安装使用自定义端口
- **WHEN** 目标节点 `ssh_port=1122` 且免密登录
- **THEN** 安装 OpenResty 的 SSH 命令 SHALL 注入 `-p 1122` 参数
- **THEN** 密码认证回退路径 SHALL 同样注入 `-p 1122`

#### Scenario: 其他远程操作透传端口
- **WHEN** 节点配置了非 22 的 `ssh_port`
- **THEN** 取消安装、软件查询、命令执行等所有 SSH 操作 SHALL 使用该端口

#### Scenario: Ansible 路径端口一致
- **WHEN** 节点配置了非 22 的 `ssh_port` 且执行 ansible 操作（install_edge/statistic/software_check 等）
- **THEN** ansible 执行 SHALL 使用该端口连接（临时注入 inventory `ansible_port`，执行后恢复原值）
- **THEN** 注入/恢复失败 SHALL 记录日志且不阻断执行（按原 inventory 配置尝试）

#### Scenario: 默认端口向后兼容
- **WHEN** 节点未配置 `ssh_port`（None 或 22）
- **THEN** SSH 命令 SHALL 与现状逐字节一致（不注入 `-p` 参数）
- **THEN** ansible 路径 SHALL 不修改 inventory（不注入 ansible_port）
