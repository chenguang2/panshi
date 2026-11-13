## ADDED Requirements

### Requirement: 直连页可选集群上下文中继

直连页按 ip:port 寻址的端点 SHALL 接受可选 `cluster_id` 参数：缺省（未传或 0）SHALL 沿用全局 IP→区域映射判定（歧义回退直连，行为与既有完全一致）；传入有效 `cluster_id` 时 SHALL 按**集群上下文优先**判定中继（与集群域操作同一 `EdgeClient._apply_relay` 语义，2026-11-13 落地），由用户选择的集群消解同 IP 跨区域歧义。

#### Scenario: 缺省行为零变化
- **WHEN** 请求任一直连页端点且不携带 `cluster_id`
- **THEN** 中继判定 SHALL 按 IP 映射解析（唯一归属→经网关、歧义→直连），与既有行为逐字节一致
- **AND** 既有用例（IP-map 断言）MUST NOT 需要任何修改

#### Scenario: 集群上下文消解歧义
- **WHEN** 目标 IP 属于多个挂不同区域的集群（IP 映射歧义），请求携带其中某个集群的 `cluster_id`
- **THEN** 中继判定 SHALL 按所选集群挂接区域路由（`route_for_cluster`），不再因全局映射歧义回退直连
- **AND** 响应 `route`/`relay_via` SHALL 如实反映实际路径；`route_state`/`route_detail` 沿既有 mark_route 契约

#### Scenario: 所选集群未挂区域或区域禁用
- **WHEN** 传入的 `cluster_id` 对应集群未挂接区域，或挂接区域的网关被禁用
- **THEN** 判定 SHALL 回退直连，响应 SHALL 携带 `route_state` 与 `route_detail` 原因（与集群域语义一致）

### Requirement: IP 归属反查提示

直连页 SHALL 提供只读端点 `GET /edge-client/ip-info?ip=`，返回该 IP 的集群归属列表（cluster_id/名称/区域）、中继判定状态与歧义冲突明细；数据 SHALL 直查 `ps_node`/`ps_cluster`（不受快照 TTL 时滞影响）。前端 SHALL 在手动输入 ip:port 模式下展示归属/歧义提示条（中性说明样式），歧义时 SHALL 提示可从集群下拉选择以经中继；提示条 MUST NOT 阻塞查询。

#### Scenario: 归属提示
- **WHEN** 用户在直连页输入已登记节点的 ip:port 并触发查询
- **THEN** 页面 SHALL 显示该 IP 的集群归属与区域（如「属于集群 test（区域 qqq）」）
- **AND** IP 无任何集群归属时 SHALL 静默不显示提示条（Edge 导入等未登记场景）

#### Scenario: 歧义提示与消解指引
- **WHEN** 该 IP 属于多个挂不同区域的集群
- **THEN** 提示条 SHALL 展示冲突明细（如「歧义：test/qqq、test-2/bj——默认直连，可从集群下拉选择以经中继」）
- **AND** 用户从集群下拉选择集群后重新查询 SHALL 经所选集群区域网关（上一需求场景）

### Requirement: 权限与安全不变

直连页新参数与新端点 SHALL 沿用 `/edge-client` 路由既有 `edge_nodes` 权限依赖，MUST NOT 新增权限键；新端点 SHALL 在 `tests/test_security_guard.py` 的 UNAUTHENTICATED_SAMPLES 补采样（#19）。

#### Scenario: 未认证访问被拒
- **WHEN** 未携带有效凭证请求 `GET /edge-client/ip-info`
- **THEN** SHALL 返回 401（路由级 `edge_nodes` 依赖统一拦截），与该路由既有端点行为一致
- **AND** 安全守卫采样（UNAUTHENTICATED_SAMPLES）SHALL 覆盖新端点
