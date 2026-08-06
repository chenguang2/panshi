## MODIFIED Requirements

### Requirement: 任务化 API

系统 SHALL 提供任务 CRUD API：创建、集群内列表、全局列表、详情、取消、重试、删除、SSE 实时推送；并提供日志文件读取端点。

#### Scenario: 创建任务
- **WHEN** 用户 POST `/clusters/{cluster_id}/node-tasks`（body 含 task_type、node_ids、params）
- **THEN** 系统 SHALL 返回 201 与任务 id
- **AND** 任务 SHALL 立即以 pending 状态进入执行队列
- **AND** params 缺省字段 SHALL 按任务类型取节点记录值：运维类任务（start/stop/reload/check/statistic）的 prefix 缺省取 `node.edge_path`（edge 程序前缀），安装类任务（install_openresty/install_edge/associate_new_openresty/edge_pack_add）的 prefix 缺省取 `node.openresty_path`（openresty 安装路径）

#### Scenario: 创建任务窗口节点全选
- **WHEN** 用户在节点任务创建窗口选择目标节点
- **THEN** 节点列表上方 SHALL 提供「全选」「取消全选」链接与「已选择 N / M 个节点」实时计数
- **AND** 「全选」SHALL 选中全部节点，「取消全选」SHALL 清空选择
- **AND** 计数 SHALL 随勾选实时更新
