# Proposal

## Why

发布状态四态（未发布 / 待发布 / 已发布 / 发布未完全生效）的判定与覆盖口径在资源间不一致：① 四态优先级把 partial 排在待发布之前——上游编辑存盘后（内容已变、未发布）列表仍显示「⚠ v2 · 发布未完全生效」，不显示「待发布」（2026-11-13 用户实测报告）；partial 描述的是旧内容的上次发布结果，内容已变后它掩盖了更主导、更能驱动行动的「待发布」事实。② partial 持久化机制（`last_publish_status` 列）只在 5 个资源（上游 / 插件组 / 全局规则 / 插件元数据 / 流代理）落地，**路由与 SSL 证书缺席**——同样「部分节点发布失败」在路由列表完全不可见，跨页面口径不一致。

## What Changes

- **四态优先级反转**：`待发布 > 部分失败`（「未发布」仍最高）。判定顺序从「未发布 → 部分失败 → 待发布 → 已发布」改为「未发布 → 待发布 → 部分失败 → 已发布」。信息无丢失论证：重新发布是全量推送，成功则两态同时清除，再失败会重新置 partial。
- **Route 补 `last_publish_status` 列**（nullable String(16)，注册 `COLUMN_MIGRATIONS`，#118）：发布/回滚经 `publish_resource`/`rollback_resource` 既有 `hasattr` 能力探测自动接入，MUST NOT 改发布编排；`routes.py` / `cluster_routes.py` 两个列表端点透传字段；`RouteList.vue` / `ClusterRoutes.vue` 前端传参。
- **SslCertificate 补 `last_publish_status` 列**（同款）：`cluster_ssl.py` 列表端点透传；`SslCertCard.vue` 前端传参。
- **`PublishStatusTag` 模板分支顺序调整**（partial 与 pending 两分支换序）+ 2 处注释同步（组件头注释、`edge_sync.derive_pending_publish` docstring 的判定顺序描述）。
- **不做**：静态资源不并入本轮——其五态徽章（`StaticResourceStateTag`）含逐节点失败明细（`publishDetail`），信息量大于四态，且是文件型资源机制不同，合并反而降级信息；不引入 features 开关；不动发布弹窗与 SSH 腿。

## Capabilities

### New Capabilities

- `route-publish-status`：路由发布状态四态（后端推导 + partial 持久化 + 标签消费），按新优先级表述。
- `ssl-publish-status`：SSL 证书发布状态四态，同上。

### Modified Capabilities

- `upstream-publish-status`：「四态判定顺序」场景反转 + 新增「部分失败后编辑保存呈现待发布」场景。
- `global-rule-publish-status`：「四态判定顺序」场景反转 + 新增编辑保存场景。
- `plugin-config-publish-status`：「四态判定顺序」场景反转 + 新增编辑保存场景。
- `plugin-metadata-publish-status`：「partial 状态展示与恢复」场景中「partial 优先于待发布判定」表述反转为「待发布优先于 partial」。

## Impact

- **后端**：`app/models/cluster.py`（Route / SslCertificate 加列）、`app/core/migrate.py`（COLUMN_MIGRATIONS +2 行，漏注册启动 crash-loop #118）、`app/api/v1/routes.py` / `cluster_routes.py` / `cluster_ssl.py`（响应透传 `last_publish_status`）、`app/services/edge_sync.py`（docstring 注释同步）。
- **前端**：`components/PublishStatusTag.vue`（分支换序）、`views/RouteList.vue` / `views/clusters/ClusterRoutes.vue` / `components/SslCertCard.vue`（传参）、`types/index.ts`（Route/SSL 行类型补字段）。
- **验证**：PG 方言冒烟必跑（新增写库路径，#31/#103）；四态优先级既有测试断言反转清单见 design D4（#217）；两列表视图口径一致性由既有「后端单点推导」约束保证，前端不新增本地推导。
