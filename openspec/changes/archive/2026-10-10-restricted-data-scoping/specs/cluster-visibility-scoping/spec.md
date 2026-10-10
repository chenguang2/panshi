# cluster-visibility-scoping Delta

## ADDED Requirements

### Requirement: 概览域只读端点按分配可见性过滤

`GET /dashboard/stats` 与 `GET /dashboard/recent-routes` SHALL 对非管理员用户按被分配集群（`sys_user_cluster`）过滤全部集群域数据，与既有集群域端点（`/clusters`、`/nodes`、`/upstreams`、`/routes`、`/global-rules`、`/plugin-configs`、`/plugin-metadata`、`/static-resources`）的分配可见性契约同源同语义——本契约补齐后集群域数据口径全站统一；管理员 SHALL 保持全量口径与响应形状完全不变。

#### Scenario: 非管理员零分配

- **WHEN** 非管理员用户无任何集群分配
- **THEN** stats 的全部集群域计数（clusters/nodes/nodes_online/nodes_untested/upstreams/routes/plugin_configs/global_rules/static_resources/plugin_metadata）SHALL 为 0，recent-routes items SHALL 为空
- **AND** users 计数 SHALL 保持全局值（非集群域计数，有意行为非遗漏）

#### Scenario: 非管理员部分分配

- **WHEN** 非管理员用户被分配集群 A、B（平台另有集群 C 未分配）
- **THEN** stats 各集群域计数 SHALL 仅统计 A、B 范围
- **AND** recent-routes SHALL 仅返回 A、B 集群的路由，按创建时间倒序取 limit

#### Scenario: 管理员口径不变

- **WHEN** 管理员请求两端口
- **THEN** 返回全量口径，与过滤引入前行为完全一致（既有管理员语境测试原样通过）

### Requirement: 可见性判定单实现

概览域两端的可见性判定 SHALL 经单一 helper 实现（管理员返回不过滤语义，非管理员返回分配集群 id 集，空集为合法结果），SHALL NOT 在两个端点内各自内联判定逻辑。

#### Scenario: helper 复用

- **WHEN** 任一端点执行过滤
- **THEN** 判定逻辑 SHALL 来自同一函数，两端口径 SHALL 一致
