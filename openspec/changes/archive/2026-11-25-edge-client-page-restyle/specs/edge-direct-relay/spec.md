# edge-direct-relay Delta

## MODIFIED Requirements

### Requirement: IP 归属反查提示

<!-- 2026-11-25 edge-client-page-restyle：提示条视觉形态升级为连接条右簇的虚线下划线弱化提示（title 承载归属/歧义明细）；
     端点、数据来源、展示时机、歧义消解与不阻塞等既有契约原文保留 -->

直连页 SHALL 提供只读端点 `GET /edge-client/ip-info?ip=`，返回该 IP 的集群归属列表（cluster_id/名称/区域）、中继判定状态与歧义冲突明细；数据 SHALL 直查 `ps_node`/`ps_cluster`（不受快照 TTL 时滞影响）。前端 SHALL 在手动输入 ip:port 模式下展示归属/歧义提示（中性说明样式，呈现在连接条右簇：虚线下划线弱化文字，归属/歧义明细经 tooltip 承载），歧义时 SHALL 提示可从集群下拉选择以经中继；提示 MUST NOT 阻塞查询。

#### Scenario: 归属提示
- **WHEN** 用户在直连页输入已登记节点的 ip:port 并触发查询
- **THEN** 页面 SHALL 显示该 IP 的集群归属与区域（如「属于集群 test（区域 qqq）」）
- **AND** IP 无任何集群归属时 SHALL 静默不显示提示条（Edge 导入等未登记场景）

#### Scenario: 歧义提示与消解指引
- **WHEN** 该 IP 属于多个挂不同区域的集群
- **THEN** 提示条 SHALL 展示冲突明细（如「歧义：test/qqq、test-2/bj——默认直连，可从集群下拉选择以经中继」）
- **AND** 用户从集群下拉选择集群后重新查询 SHALL 经所选集群区域网关（上一需求场景）
