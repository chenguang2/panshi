# Proposal

## Why

Edge 直连页（`/edge-client`，运维诊断工具）当前按**全局 IP→区域映射**自动判定中继：IP 唯一归属挂区域集群时自动经网关，歧义 IP（同一机器登记在两个挂不同区域的集群，如实测 test/qqq 与 test-2/bj 共用 192.168.0.13/14/15）回退直连。在中继的真实部署形态（平台直连不到节点、必须经网关）下，**歧义 IP 节点在直连页彻底失能**——无法经中继到达，而页面明明已有集群/节点选择器（集群上下文已在手），只是从未传给后端（后端 ~20 个端点全部 `EdgeClient(0, node_ip, node_port)` 无集群构造）。2026-11-13 用户裁决：立项 B+C（集群选择器接线 + IP 归属反查提示），先出提案。

## What Changes

- **批 1 后端**：
  - `/edge-client` 全部按 ip:port 寻址的端点（~20 个）增加可选 query 参数 `cluster_id`（缺省 0 = 现状 IP 映射判定，行为零变化）；传入时构造 `EdgeClient(cluster_id, node_ip, node_port)`——中继判定自动走 2026-11-13 已落地的**集群上下文优先**语义（`route_for_cluster`），歧义由用户选择的集群消解，EdgeClient 侧零改动
  - 新增只读端点 `GET /edge-client/ip-info?ip=`：返回该 IP 的集群归属（名称/区域列表）、歧义冲突明细、`route_for_ip` 状态（active/ambiguous/disabled/none）——数据源直查 `ps_node`/`ps_cluster`（快照无 ip→集群列表），供前端显示归属提示
- **批 2 前端**（`EdgeClient.vue`）：
  - 集群+节点选择器已有：选中集群后发起查询自动携带 `cluster_id`
  - 手动输入 ip:port 模式：输入后调 `ip-info` 显示归属提示条（「属于集群 test（区域 qqq）」/「歧义：test/qqq、test-2/bj——默认直连，可从集群下拉选择以经中继」）；提示条为中性说明样式（#258：不惊吓、可操作）
  - 路由标注复用既有 `routeLabel(route, r)`（今晨 C② 的直连原因字段直连页已接）
- **不做**：不引入手动选网关下拉（绕过集群模型，与全站语义不一致）；不改集群域操作（发布/连接测试已有完整中继支持）；不加权限键（沿用 `edge_nodes` 路由级依赖）

## Capabilities

### New Capabilities

- `edge-direct-relay`：直连页的集群上下文中继支持（可选 cluster_id 消解歧义 + IP 归属反查提示 + 既有 IP 映射自动判定保持）。

### Modified Capabilities

（无——`edge-client-manual-query` / `edge-client-stream-route` / `unified-edge-client` 均不钉直连页寻址语义；`relay-channel-routing` 族管集群域流程，不受影响）

## Impact

- 后端：`app/api/v1/edge_client.py`（~20 端点签名 +1 参数、`EdgeClient` 构造传参、新 ip-info 端点）；`test_security_guard.py` UNAUTHENTICATED_SAMPLES 补新端点采样（#19 铁律）
- 前端：`EdgeClient.vue`（选择器接线 + 提示条）；`api/edgeClient.ts`（如有独立模块则补参数）
- 测试：`test_edge_client_relay_route.py` 既有 IP-map 断言不传 cluster_id → 行为不变 ✓；新增「传 cluster_id → 歧义 IP 经所选集群区域」用例（TDD）；前端 EdgeClient 系列用例核对选择器交互
