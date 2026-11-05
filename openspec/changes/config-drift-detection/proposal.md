# Proposal: 集群资源配置漂移检测（config-drift-detection）

## Why

路由/上游等核心网关配置只经平台下发，但 Edge Admin API 本身可被绕过平台直接访问（运维 curl/脚本、其他系统）。任何旁路修改平台都无感知——平台显示与 Edge 运行态可能静默背离，故障排查时「平台看到的配置」不可信（optimization-audit-2026-11-05 §4.2，P1）。存在性验证：绕过平台 curl 改 Edge 任一路由，平台无任何提示。

## What Changes

- 发布快照补存**实发 Edge 载荷**：`ps_config_version` 新增 `edge_payload TEXT` 列（发布时把传给 `publish_resource` 的 `edge_data` 一并落快照），使「平台已下发意图」有精确不可变基线；存量旧版本无该载荷，检测时降级提示。
- 新增**漂移检测服务与端点**：按集群维度对**全部经统一发布编排（publish_resource）下发的资源类型**（路由/上游/插件组/全局规则/SSL/流代理/DNS 代理等，清单以发布调用方枚举为准）做「最新发布快照（实发载荷）vs Edge 运行态 GET」的字段级对比，输出三种状态：`一致` / `漂移`（Edge 被旁路增删改，含字段级差异清单）/ `无法评估`（未发布过、快照无实发载荷、Edge 不可达）；差异展示对敏感字段（如 SSL 私钥）脱敏。检测走 EdgeClient HTTP 腿（中继感知），逐资源类型抽样节点取运行态。
- 前端**检测入口与结果抽屉**：集群管理页每行新增「漂移检测」操作，结果抽屉按资源列出状态与差异明细（字段路径、平台值/Edge 值），支持复检。
- 不改发布/回滚流程本体；不做自动修复（后续独立立项）、不做后台定时扫描（按需触发）。

## Capabilities

### New Capabilities

- `config-drift-detection`: 配置漂移检测域——发布快照实发载荷留痕、按需漂移检测（平台意图 vs Edge 运行态字段级对比）、三态结论与降级语义、检测结果展示。

### Modified Capabilities

<!-- 无：发布/版本/回滚既有需求不变（publish_resource 仅在快照处多存一份 edge_data，
不改变响应契约与版本语义）；ConfigVersion 加列属实现细节，不构成需求变更。 -->

（无）

## Impact

- 后端：`app/models/cluster.py`（ConfigVersion 加列）、`app/core/migrate.py`（COLUMN_MIGRATIONS 注册，#118 崩溃循环风险点）、`app/services/edge_sync.py`（publish_resource 落实发载荷）、新增 `app/services/drift_detection.py`（对比服务）、新增 `app/api/v1/cluster_drift.py`（只读端点，挂鉴权依赖，#19）。
- 触发 PG 方言冒烟强制项（#103：新列 + 写路径）；`test_publish_response.py` 源码守卫需核对（#18：publish 函数体变更）。
- 前端：`ClusterList.vue` 行操作 + 新结果抽屉组件 + `api/clusters.ts` 扩展；权限键沿用 `clusters` 容器权限（不新增可路由资源，无 #19 双端注册负担）。
- 已知边界：仅覆盖「最新一次发布」的基线（历史版本不检测）；多节点 Edge 运行态以抽样节点为准（平台逐节点发布本就最终一致，不逐节点全对账）；Edge 删除的旁路资源以「平台有、Edge 无」差异呈现。
