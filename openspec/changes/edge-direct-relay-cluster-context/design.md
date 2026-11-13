# Design

## Context

直连页 ~20 个端点均为 path 参数寻址（`/nodes/{ip}/{port}/...`），统一构造 `EdgeClient(0, node_ip=ip, node_port=port)` 并经 `edge_sync.mark_route` 输出 `route`/`relay_via`（批 2026-11-13 C② 起直连原因字段 `route_state`/`route_detail` 同步透出，前端 `routeLabel(route, r)` 已接）。页面已有集群下拉（`selectedClusterId` → `GET /clusters/{id}/nodes` 填充节点下拉）与「选节点即自动查询」主路径（edge-client-manual-query）。中继判定语义已在 `EdgeClient._apply_relay`：`cluster_id>0` → `route_for_cluster`（集群上下文优先），否则 `route_for_ip`（IP 映射，歧义回退直连）。

## Goals / Non-Goals

**Goals**：歧义 IP 在直连页可经中继（用户选集群消解）；IP 归属透明化；未选集群时行为零变化。
**Non-Goals**：手动选网关；集群域流程改造；新权限键；自动发布/写入类变更（直连页只读+诊断写不涉及）。

## Decisions

**D1 参数形态：逐端点可选 query 参数 `cluster_id`，缺省 0**
每个端点签名加 `cluster_id: int = 0` 并透传 `EdgeClient(cluster_id, node_ip=ip, node_port=port)`。备选「依赖注入/中间件全局态」被否：显式参数与既有 path-param 风格一致、单点可读（LLM 一次 read 即得），且「缺省 0 = IP 映射」保证全部既有用例与行为零变化。`ip-info` 端点不需要该参数（它回答「这个 IP 属于谁」）。

**D2 ip-info 数据源：直查 DB，不走快照**
`SELECT ps_node JOIN ps_cluster` 按 IP 反查归属集群与区域，叠加 `relay_registry.route_for_ip(ip)` 状态与 `route_conflict_for_ip(ip)` 冲突明细。快照只有 ip→region 与冲突文本，没有 ip→集群列表；直查一条 join 即完整，且不受快照 TTL 时滞影响。响应形状：`{ clusters: [{cluster_id, cluster_name, region_code}], relay_state, conflict_detail, nodes: [{management_port}] }`（nodes 顺带给同 IP 多端口场景提示）。

**D3 前端交互：两种模式分流**
- 集群+节点模式（主路径）：选中节点自动查询（既有行为不变），请求自动携带 `selectedClusterId`——集群上下文天然在手，歧义自动消解，用户无感知受益
- 手动 ip:port 模式：输入后（查询触发时）调 `ip-info` 渲染中性提示条；歧义时提示「可从集群下拉选择以经中继」；提示条不阻塞查询（直连不可达时用户自然会选集群重试）
- 提示条样式沿 #258：中性说明、可操作、不惊吓

**D4 断言反转清单（#217）**
- 后端 `test_edge_client_relay_route.py`：全部既有用例不传 `cluster_id` → 缺省 0 → 行为不变，无反转；新增 3 用例（传 cluster_id 的歧义 IP 经所选集群区域 / cluster_id=0 歧义回退直连回归钉 / ip-info 形状与歧义明细）
- 前端：EdgeClient 系列测试（EdgeClientUx / EdgeClientRouteLabel / EdgeClientSslPagination / manual-query 相关）核对选择节点自动查询的请求参数——新增 cluster_id 断言；无既有断言反转预期（请求参数为增量）

**D5 分批**
批 1 = 后端参数透传 + ip-info 端点 + TDD（无 UI 变化，独立可验收：API 手测）；批 2 = 前端接线与提示条。批 1 先行可让脚本/API 用户先受益。

## Risks / Trade-offs

- ~20 个端点逐个加参数属机械重复——接受：显式优于隐式（本项目「直连模式」一贯直写风格），且每处一行、pattern 均一
- `cluster_id` 与 ip:port 不一致（选了 A 集群却连 B 集群的节点 ip:port）：中继按所选集群区域走，目标仍为 ip:port 本身（与发布流同语义，路由只改路径不改目标）；提示条可在歧义场景顺带展示所选集群与 IP 归属不一致的说明——批 2 视实现成本决定是否纳入
- ip-info 暴露集群归属给 `edge_nodes` 权限持有者：内网运维工具语义（#257 已接受的内网共管形态），无新增暴露面
