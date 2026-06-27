## MODIFIED Requirements

### Requirement: 节点操作

→ 操作成功后需同步更新 `node.status`

#### Scenario: 启动节点成功后状态更新
- **WHEN** 用户点击"启动"且命令执行成功
- **THEN** `node.status` SHALL 被设为 1（正常）

#### Scenario: 停止节点成功后状态更新
- **WHEN** 用户点击"停止"且命令执行成功
- **THEN** `node.status` SHALL 被设为 0（停用）

#### Scenario: 重启节点成功后状态更新
- **WHEN** 用户点击"重启"且命令执行成功
- **THEN** `node.status` SHALL 被设为 1（正常）

#### Scenario: 配置检查成功后不更新状态
- **WHEN** 用户点击"检测"且 `nginx -t` 配置检查成功
- **THEN** `node.status` SHALL NOT 被修改（配置检查不代表进程状态）
- **AND** `node.status_detail` 仍被更新

#### Scenario: 检测节点发现 nginx 运行中
- **WHEN** 用户点击"状态查询"且命令执行成功，解析到 `nginx_running=True`
- **THEN** `node.status` SHALL 被设为 1（正常）

#### Scenario: 检测节点发现 nginx 未运行
- **WHEN** 用户点击"状态查询"且命令执行成功，解析到 `nginx_running=False` 且 `nginx_status != "unknown"`
- **THEN** `node.status` SHALL 被设为 0（停用）

#### Scenario: 检测节点返回不可解析的 stdout
- **WHEN** 用户点击"状态查询"且命令执行成功，但 `_parse_nginx_status` 返回 `nginx_status="unknown"`
- **THEN** `node.status` SHALL NOT 被修改（不可解析不代表 nginx 实际状态）

#### Scenario: 任何操作失败不更新状态
- **WHEN** 用户执行任意节点操作且命令执行失败（SSH 不通、返回码非零等）
- **THEN** `node.status` SHALL NOT 被修改
- **AND** `node.status_detail` 仍被更新以记录失败信息
