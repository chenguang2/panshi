## ADDED Requirements

### Requirement: 关联新OpenResty
系统 SHALL 支持在安装新版本 OpenResty 后，将已有 Edge 实例绑定到新 OpenResty。通过 `POST /clusters/{cluster_id}/nodes/{node_id}/associate-new-openresty` 执行。后端 SHALL 使用 `upgrade_openresty` ansible tag，执行 `manager upgrade {edge_dir}`，内部自动处理 Edge 升级和初始化。

#### Scenario: 成功关联新 OpenResty
- **WHEN** 用户安装新 OpenResty 后，点击"关联新 OpenResty"
- **AND** 节点 `edge_path = /work/jboss/5/uap-edge2`，`edge_install_path = /work/jboss/5/openresty-new`
- **THEN** 后端 SHALL 调用 ansible tag `upgrade_openresty`
- **AND** Ansible SHALL 在新 OpenResty 目录下执行 `manager upgrade /work/jboss/5/uap-edge2`
- **AND** `manager upgrade` 内部自动完成初始化
- **THEN** Edge 实例 SHALL 运行在新 OpenResty 之上

#### Scenario: 节点不存在
- **WHEN** 请求的 node_id 不存在或不属于该集群
- **THEN** 后端 SHALL 返回 404

#### Scenario: 新 OpenResty 路径无效
- **WHEN** 节点的 `edge_install_path` 为空且 body 未提供 `prefix`
- **THEN** 后端 SHALL 返回 422 验证错误
