## ADDED Requirements

### Requirement: 查看小版本包列表
系统 SHALL 提供 `GET /clusters/{cluster_id}/nodes/{node_id}/edge-pack-list` 接口，返回 Edge 实例当前可用的小版本包列表。通过 ansible 执行 `bin/edge pack-list`，解析输出中 `[*]` 前缀标记当前版本。

#### Scenario: 成功返回版本列表
- **WHEN** 用户发送 `GET /api/v1/clusters/1/nodes/5/edge-pack-list`
- **AND** 远端执行 `bin/edge pack-list` 返回 `[*]2.7.5.26012617\n2.7.6.26020421`
- **THEN** 响应状态码 SHALL 为 200
- **AND** 响应体 SHALL 包含 `versions` 数组
- **AND** 数组第一个元素 SHALL 为 `{ name: "2.7.5.26012617", current: true }`
- **AND** 数组第二个元素 SHALL 为 `{ name: "2.7.6.26020421", current: false }`

#### Scenario: 节点不可达
- **WHEN** 节点无法通过 SSH 连接
- **THEN** 后端 SHALL 返回 502

### Requirement: 添加小版本包
系统 SHALL 支持用户从 `backend/ansible/soft/` 目录选择 `edge-pack-*.tgz` 文件，通过 `POST /clusters/{cluster_id}/nodes/{node_id}/edge-pack-add` 上传到远端并注册。后端 SHALL 提供 `GET /clusters/{cluster_id}/nodes/edge-pack-files` 接口列出可选文件。

#### Scenario: 成功添加版本包
- **WHEN** 用户选择 `edge-pack-2.7.6.26020421.tgz` 并确认添加
- **AND** 后端接收到 `POST` 请求，body 包含 `pack_file: "edge-pack-2.7.6.26020421.tgz"`
- **THEN** 后端 SHALL 从 `PRIVATE_DATA_DIR/soft/` 构建 `srcpath`
- **AND** Ansible SHALL copy 文件到远端 `{destpath}/soft/` 目录
- **AND** Ansible SHALL 执行 `manager pack-add {pack_file}`
- **AND** 响应 SHALL 为 SSE 流式输出

#### Scenario: 文件列表 API 为空
- **WHEN** `backend/ansible/soft/` 目录下无 `edge-pack-*` 文件
- **THEN** 响应状态码 SHALL 为 200
- **AND** `files` 数组 SHALL 为空

### Requirement: 切换小版本
系统 SHALL 支持用户选择目标版本执行 pack-rebase，通过 `POST /clusters/{cluster_id}/nodes/{node_id}/edge-pack-rebase` 接口。后端 SHALL 执行 `bin/edge pack-rebase {version}` → `bin/edge init` → `bin/edge reload` 三步。

#### Scenario: 成功切换版本
- **WHEN** 用户选择版本 `2.7.6.26020421` 并确认切换
- **AND** 后端接收到 `POST`，body 包含 `version: "2.7.6.26020421"`
- **THEN** Ansible SHALL 在 `{{ edge_target }}` 目录下执行 `bin/edge pack-rebase 2.7.6.26020421`
- **AND** Ansible SHALL 执行 `bin/edge init` 加载新版本配置
- **AND** Ansible SHALL 执行 `bin/edge reload` 使新版本生效
- **AND** 响应 SHALL 为 SSE 流式输出

#### Scenario: 版本不存在
- **WHEN** 用户选择的版本在 pack-list 中不存在
- **THEN** `pack-rebase` SHALL 报错
- **AND** SSE 流 SHALL 输出错误信息
