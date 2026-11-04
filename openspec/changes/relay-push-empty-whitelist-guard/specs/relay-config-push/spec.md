# Spec Delta

## ADDED Requirements

### Requirement: 空名单下发防护与节点计数回填

`POST /relay/gateways/{id}/push-config` SHALL 在渲染白名单后统计该区域启用节点数（`status==1`）：当为 0 且请求未显式携带 `allow_empty=true` 时，SHALL 拒绝下发（HTTP 409），detail SHALL 明确提示修复动作「将节点状态改为『启用』」并点名挂接集群与禁用节点数，同时说明可确认空名单下发；SHALL NOT 触发 ansible 推送。显式携带 `allow_empty=true` 时 SHALL 照常下发空名单。该区域存在启用节点时，无论是否携带 `allow_empty` 均 SHALL 照常下发。`GET /relay/gateways` 列表 SHALL 逐区域回填 `enabled_node_count` 与 `total_node_count`。前端「下发配置」确认弹窗 SHALL 展示本次将下发的启用节点数与全量替换语义；区域 0 启用节点时 SHALL 升级为危险确认（明确警示白名单将被清空、该局发布/节点任务将被 403 拒绝，并提示先到集群节点列表将节点状态改为「启用」），用户显式确认后才携带 `allow_empty: true`。`init` 端点与「查看配置」预览 SHALL NOT 受空名单拦截（装机引导与只读预览语义保持）。

#### Scenario: 无启用节点时默认拒绝

- **WHEN** 某区域所属集群的节点全部为禁用状态（启用数 0），对该区域触发下发且未携带 `allow_empty`
- **THEN** 返回 409，detail 含「请先将节点状态改为『启用』」与挂接集群名及禁用节点数，该局网关机配置未被改动

#### Scenario: 显式确认空名单下发放行

- **WHEN** 同一 0 启用节点区域，下发请求显式携带 `allow_empty=true`
- **THEN** 下发照常执行，白名单以空表（仅 `default ""`）覆盖该局网关机

#### Scenario: 有启用节点时不受影响

- **WHEN** 区域存在 ≥1 个启用节点（另有若干禁用节点），下发未携带 `allow_empty`
- **THEN** 下发照常执行，白名单仅含启用节点

#### Scenario: 列表回填节点计数

- **WHEN** 打开中继区域管理页加载区域列表
- **THEN** 每个区域行携带 `enabled_node_count` 与 `total_node_count`，与该区域集群节点实况一致

#### Scenario: 前端空名单危险确认

- **WHEN** 对 0 启用节点的区域点击「下发配置」并在确认弹窗中确认
- **THEN** 弹窗为危险样式，警示白名单将被清空与 403 后果，并提示先到集群节点列表将节点状态改为「启用」；下发请求体携带 `allow_empty: true`

#### Scenario: init 不受空名单拦截

- **WHEN** 对 0 启用节点的区域触发「初始化网关」
- **THEN** 初始化照常执行（写 8443 server 块与当前白名单），不返回 409
