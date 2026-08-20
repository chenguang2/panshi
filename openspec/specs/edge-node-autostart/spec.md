## Purpose

提供独立的自启动管理页面，管理 Edge 节点的 systemd 开机自启动。支持对每个节点启用、禁用、查询自启动状态。启用/禁用通过 SSH 以 root 连接执行 systemctl；查询通过节点现有非 root 连接读取。root 凭据仅本次使用，不持久化、不写日志明文。

## Requirements

### Requirement: 自启动管理页面

系统 SHALL 提供独立的自启动管理页面（与工具箱平行的菜单），列出集群下的 Edge 节点，并支持对每个节点执行自启动的启用、禁用与状态查询。

#### Scenario: 展示节点列表
- **WHEN** 用户打开自启动管理页面
- **THEN** 系统 SHALL 列出集群及其节点（含 IP、集群名、Edge 目录等）
- **AND** 每个节点 SHALL 提供"启用自启动"、"禁用自启动"、"查询状态"三个操作

#### Scenario: 查询状态无需 root
- **WHEN** 用户对节点执行"查询状态"
- **THEN** 系统 SHALL 复用节点现有非 root 连接执行 `systemctl is-enabled`
- **AND** 返回 enabled / disabled / not_configured 状态，无需提供 root 凭据

### Requirement: 启用/禁用自启动

系统 SHALL 通过 SSH 以 root 连接目标节点下发 systemd 服务并 enable/disable，使 Edge 开机自启动。

#### Scenario: 启用自启动（root）
- **WHEN** 用户对节点执行"启用自启动"
- **AND** 提供 root 账号密码（高级参数，必填）
- **THEN** 系统 SHALL 以 root 连接节点，写入 `/etc/systemd/system/edge.service`
- **AND** 执行 `systemctl daemon-reload` 与 `systemctl enable edge`
- **AND** 返回流式执行进度与最终 rc/status

#### Scenario: 禁用自启动（root）
- **WHEN** 用户对节点执行"禁用自启动"
- **AND** 提供 root 账号密码（高级参数，必填）
- **THEN** 系统 SHALL 以 root 连接节点执行 `systemctl disable edge`
- **AND** 保留 `/etc/systemd/system/edge.service` 文件（仅取消自启，不删除）

#### Scenario: 高级参数可覆盖默认值
- **WHEN** 用户执行启用/禁用
- **THEN** 系统 SHALL 默认从节点数据推断 Edge 目录与运行用户（运行用户默认取节点 inventory 用户，未配置则取运行后台程序的用户）
- **AND** 用户 SHALL 可在高级参数区覆盖：Edge 目录、运行用户

### Requirement: root 凭据安全处理

系统 SHALL 仅在本次启用/禁用请求内使用 root 凭据连接节点，不持久化、不写入日志明文。

#### Scenario: 凭据不落库
- **WHEN** 用户提交启用/禁用请求并携带 root 密码
- **THEN** 系统 SHALL 仅将 root 账号密码用于本次 SSH 连接
- **AND** 不得将密码写入数据库或持久化存储

#### Scenario: 凭据不写日志
- **WHEN** 系统执行启用/禁用
- **THEN** 日志不得输出 root 密码明文

### Requirement: 后端 API

系统 SHALL 提供 REST API 触发自启动操作，复用现有节点验证与 SSE 进度流基础设施。

#### Scenario: 触发自启动操作
- **WHEN** 前端调用 `POST /nodes/{node_id}/autostart`，携带 `action`（enable/disable/status）与可选参数
- **THEN** 系统 SHALL 校验节点存在
- **AND** 通过 SSE 流式返回执行进度与最终结果
- **AND** 返回状态与现有节点操作 API 风格一致
