# Spec Delta

## MODIFIED Requirements

### Requirement: 表格列定义

节点列表表格 SHALL 包含以下列：选择框、IP、服务端口、管理端口、安装路径（Edge 路径与 OpenResty 路径在单列内两行堆叠展示，以 `Edge`/`OR` 小标签标注，完整值悬浮可见）、状态、Edge版本、操作。「所属集群」SHALL NOT 再作为表格列——集群归属由集群分组组头呈现替代（见 `list-page-cluster-grouping`），集群筛选下拉保留。

列配置中 Edge 安装路径与 OpenResty 安装路径 SHALL 仍为两个独立字段（存储键与既有持久化兼容）：两者均启用时「安装路径」列两行堆叠；仅启用其一时该列单行展示对应路径。

#### Scenario: Nginx列改为Edge版本
- **WHEN** 系统渲染节点列表表格
- **THEN** 原来显示 Nginx 状态的列改为显示 Edge 版本，字段来源为 status_detail.statistic.edge_version
- **AND** 若节点未执行过状态查询导致版本信息缺失，显示 "-"

#### Scenario: 去掉心跳时间列
- **WHEN** 系统渲染节点列表表格
- **THEN** 不包含心跳时间（last_heartbeat）列

#### Scenario: 集群列由分组替代
- **WHEN** 系统渲染节点列表表格
- **THEN** 不存在「所属集群」列，集群名出现在各分组组头行
- **AND** 工具条集群筛选下拉保留，筛选行为不变

#### Scenario: 安装路径两行堆叠
- **WHEN** 某节点行同时启用 Edge 安装路径与 OpenResty 安装路径两个字段
- **THEN** 「安装路径」列单列内两行堆叠：首行 `Edge` 小标签 + Edge 路径，次行 `OR` 小标签 + OpenResty 路径，悬浮可见完整路径值
- **WHEN** 仅启用其中之一
- **THEN** 该列单行展示对应路径
