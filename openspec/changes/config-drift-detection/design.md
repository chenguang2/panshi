# Design: 集群资源配置漂移检测（config-drift-detection）

## Context

- 发布编排单实现 `edge_sync.publish_resource`（#18）已同时持有两份形态：`config_data`（平台形态，入 ConfigVersion.config 快照）与 `edge_data`（Edge 形态实发载荷，PUT 给 Edge 后丢弃）——**实发载荷目前不留痕**，这是「平台意图」唯一精确基线的缺口。
- Edge 读取通道现成：`EdgeClient.list_routes()/get_route(route_id)/list_upstreams()/get_upstream(id)`（HTTP 腿、中继感知、白名单 403 转译在底层请求方法，#187/#101）。
- set-diff 先例：relay `push_drift`（快照 vs 当前启用集合差集，含测试），但那是标量集合；本域需字段级 JSON diff。
- 列迁移通道现成：`migrate.py` COLUMN_MIGRATIONS + `_ensure_index` 先例（ps_config_version 已有索引注册行）。#118：漏注册 = 启动崩溃循环。
- 多节点语义：发布是逐节点幂等 PUT（最终一致），Edge 各节点运行态本就可能短暂不一致；检测抽样单节点即可回答「有无旁路修改」。
- 前端：VersionManagementModal / 集群卡片（#52）已有成熟解剖；操作列扩展有现成范式。

## Goals / Non-Goals

**Goals:**
- 精确基线：快照留存实发载荷，检测回答「Edge 是否被绕过平台改过」。
- 三态结论 + 字段级差异，可解释、可复检、只读。
- 首期路由 + 上游；通道与模型对扩展资源类型开放。

**Non-Goals:**
- 不做自动修复/一键回写（独立立项）。
- 不做后台定时扫描与常驻徽章轮询（按需触发；结论不落库缓存）。
- 不做逐节点全对账（抽样单节点；多节点差异属发布一致性范畴）。
- 不覆盖历史版本基线（仅最新发布）。

## Decisions

**D1 基线 = 快照留存实发载荷（新增 `edge_payload` 列），不在检测时重推导。**
`publish_resource` 落快照处把 `edge_data`（dict/list 原样 `json.dumps`）存入新列。备选「检测时用平台对象现调 convert_*_to_edge_format 重推导」被否：平台对象可能已编辑（pending_publish），推导结果是「现在想发的」而非「当时发过的」，会把平台未发布改动误报成 Edge 漂移，语义不纯。存量旧版本列值为 NULL → 检测降级「无法评估（基线缺失，请重新发布）」。列注册 COLUMN_MIGRATIONS（#118 强制），触发 PG 方言冒烟（#103）。

**D2 对比算法：规范化 JSON 字段级递归 diff + 服务端自管理字段白名单。**
结构：`{added: {path: edge_value}, removed: {path: baseline_value}, changed: [{path, baseline, edge}]}`。路径用点号+数组下标。白名单（Edge 运行态自管理、与下发意图无关的字段）在对比前双侧剔除：`id`（Edge 侧 hex 与平台 UUID 本就不同，#101）、`update_time`/`create_time` 类时间戳、上游健康检查动态状态（`checks.active.healthy`/`unhealthy_history` 等运行态子树——上游运行态里健康数据恒动，不剔除必误报；实施时按 Edge GET 实测响应形态圈定，#43 夹具教训：mock 必须取自真实响应）。等价比较用 Python 值相等（数字/字符串规范化：Edge 侧数值可能回传字符串型端口，实施时按实测做类型归一）。

**D3 检测服务 `services/drift_detection.py`：纯函数 diff + 编排薄层。**
编排：取集群活跃节点抽样 1 个 → 建 EdgeClient → 遍历路由/上游：查各自最新 ConfigVersion（复用既有 max(version) 查询形态）→ 无版本 = 无法评估（未发布）→ 有版本无 edge_payload = 无法评估（基线缺失）→ 有基线：路由按 name 匹配 Edge list（平台 name 唯一约束已有）+ upstream 按 Edge id 匹配（发布用平台 id 作 Edge id，UUID 带横线形态，#101 两种 id 并存——匹配键以发布路径写入的 id 为准）→ get_route/get_upstream 逐字段 diff。任何 Edge 读取异常 → 该资源独立「无法评估」（错误走既有中文转译），不中断整批。端点 `GET /clusters/{cluster_id}/drift`（只读，router 级 get_current_user 依赖对齐 cluster_*.py，#19 采样补 `GET /clusters/{id}/drift`——GET 无审计骨架，仅鉴权采样）。

**D4 响应与 UI：三态分组 + 差异抽屉。**
响应 schema：`{cluster_id, checked_at, summary: {ok, drift, unknown, out_of_scope}, routes: [...], upstreams: [...], out_of_scope_types: [...]}`，每资源 `{resource_id, name, status: ok|drift|unknown, reason?, diff?}`。前端：ClusterList 行操作「漂移检测」（loading 态，检测秒级~十秒级）→ 结果抽屉（AppModal 形态，#25）：summary 计数条 + 按类型分组列表 + 漂移项展开 diff 表格（字段路径/基线值/运行态值三列）+「重新检测」按钮。api/clusters.ts 加 `getClusterDrift`。不做常驻状态列（避免诱导轮询）。

**D5 测试策略。**
diff 纯函数单测（added/removed/changed/白名单剔除/类型归一）；编排层 mock EdgeClient（#43：mock 数据形状取自 Edge GET 实测形态——实施前先对 dev Edge 抓真实响应钉形状）；列迁移用例（sqlite+PG smoke #103）；发布落实发载荷断言（扩展 publish 既有测试 + `test_publish_response.py` 守卫核对 #18）；E2E 不新增（组件测试覆盖抽屉三态）。

## Risks / Trade-offs

- **新列写入路径 = PG 冒烟强制**（#103）→ 合入前跑 `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py`。
- **Edge 运行态形态漂移**（Edge 版本升级回传字段变化）→ 白名单与类型归一集中单文件，形态实测锚定；差异展示保留原值避免误读。
- **name 匹配的盲区**：旁路建了与平台同名但内容不同的路由 → 归入 changed（按 name 对上后逐字段 diff 可见差异）；旁路删除再重建异 id 同名路由同理，不漏报。
- **性能**：18 集群 × 3 节点规模下单集群检测 = 1 次列表 + N 次 get（N=资源数），秒级；`MAX_PAGE_SIZE` 不涉及（Edge list 全量返回）。
- **审计**：只读端点无审计骨架（GET 无审计插入），无 ROUTE_MAP 负担。

## Migration Plan

升级即建列（COLUMN_MIGRATIONS，启动自动补列，幂等）。存量快照无载荷 → 检测对未重新发布的资源降级「无法评估」；运维可选择对重点资源重新发布一次建立基线。回滚代码安全（列留存无害）。

## Open Questions

见交付时提交用户裁决的 4 个决策点（基线方案 D1、首期范围、触发形态、UI 形态——均已按推荐编码，用户可改选）。
