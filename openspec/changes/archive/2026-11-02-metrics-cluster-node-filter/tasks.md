# metrics-cluster-node-filter 任务清单

> 约定：全部按 TDD（先 RED 验证失败原因，再 GREEN）；后端测试 mock 形状取自真实响应（AGENTS #43）；前端集群节点全量拉取必须走 `fetchAllClusterNodes`（#216 守卫）；共享 store/组件语义变更前先 grep 消费方与既有断言、全量单测收口（#217/#208）；无 schema/写库路径改动，PG 冒烟不强制；实机验收用 test 集群真实流量 + `manual-screenshots.mjs`。
> 评审基线：本文档 design.md（三项用户裁决：两级联动 / QPS 保持现行源 / 未纳管提供选项；ClickHouse 属性覆盖 2026-11-02 实测）。

## 1. 后端 · filter 解析单点（P0，design D1/D2/D6）
- [x] 1.1 RED：`tests/test_metrics_cluster_filter.py`——`_resolve_filter_ips` 三形态（cluster:{id}→该集群节点 ip 集·含禁用节点 / node:{ip}→[ip] / unmanaged→近期上报−平台节点差集）；`cluster:{id}` 失效→None+warning 语义；`node:{ip}` 非法格式与非法 `filter` 值→400 中文报错
- [x] 1.2 实现 `_resolve_filter_ips`（metrics_service 单点，ps_node 查询 + gauge up 近 24h DISTINCT ip 差集）；GREEN
- [x] 1.3 回归 `-k "metrics or node_health"`（既有用例应全绿——无 filter 参数路径行为不变）

## 2. 后端 · 端点接线（P0，design D3）
- [x] 2.1 RED：6 端点过滤生效断言——time-series（counter 路径 QPS + gauge 路径基础设施）、summary（connectionStates 过滤 + `source_ok` 不随筛选）、route-stats（四视图至少抽 qps/bandwidth）、status-analysis、time-comparison（day/week + 采样计数）、node-health（status/resource）；以及无 filter 参数时行为与现状完全一致（对照断言）
- [x] 2.2 各查询函数加 ips 参数：`AND Attributes['ip'] IN %(ips)s` 参数化注入最内层 WHERE（counter 差分按序列算再聚合，语义不变）；GREEN
- [x] 2.3 time-comparison 逐分支核对（today/yesterday/weekly 的请求量与采样计数四组 WHERE 全部带上过滤——漏一处即静默不生效，逐分支断言钉死）
- [x] 2.4 回归 `-k "metrics or node_health or route_stats or time_comparison or status"` 全绿

## 3. 前端 · 状态与控件（P1，design D4/D5）
- [x] 3.1 消费方普查：metricsDashboard store / MetricsDashboard.vue 消费方与既有断言清单（#217 前置）
- [x] 3.2 RED（store）：`clusterId/nodeIp` 状态、`filter` 字符串组装（-1→unmanaged、nodeIp 优先级）、筛选变化触发全页 reload 编排、失效回退；GREEN
- [x] 3.3 RED（视图）：控制行两下拉渲染与联动状态机——默认「全部集群」+ 节点禁用；选集群→节点下拉启用（fetchAllClusterNodes 拉取·#216）；切回全部集群→节点重置禁用；「未纳管节点」选项（为空置灰+tooltip）；URL `?cluster=&node=` 回显与 router.replace 写回；GREEN
- [x] 3.4 `src/api/metrics.ts` 各函数加 `filter?` 参数透传；组件测试按需补 filter 断言
- [x] 3.5 `source_ok === false` 时下拉保持可用断言

## 4. 收口与实机验收
- [x] 4.1 前端全量 `npx vitest run --no-file-parallelism`；`npx vue-tsc -b`；后端 `-k "metrics"` 全量
- [x] 4.2 实机验收（test 集群，localhost:12345）：① 默认视角数值与改造前一致（对照截图）；② 选 test 集群→全卡数值收窄（QPS/路由统计/状态码/时间对比/节点健康逐卡对照）；③ 再选具体节点→进一步收窄；④「未纳管节点」视角（test 环境若集合为空则置灰取证）；⑤ URL 复制新开页签回显生效；⑥ 失效 cluster id 静默回退；⑦ 7d 大窗口下筛选响应耗时记录；⑧ 截图入 docs（`manual-screenshots.mjs` 16 组补筛选态一张）
- [x] 4.3 用户验收确认

## 明确不做（本轮裁剪，同 P2 待办 #1/#3/#4）
- 图表时间刻度、指标查询页互链、跨会话筛选记忆（仅 URL 同步）、节点健康卡下钻联动、采集端打标变更
