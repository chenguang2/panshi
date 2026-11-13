# Design

## Context

四态机制现状（详见 proposal Why）：`pending_publish` 推导与 `last_publish_status` 持久化均已在共享单点（`edge_sync.derive_pending_publish` / `publish_resource`+`rollback_resource` 的 `hasattr` 能力探测写回），`PublishStatusTag` 组件以模板分支顺序承载四态优先级。Route / SslCertificate 缺 `last_publish_status` 列；Route 的 pending 推导在列表端点经 publish-map 已接入，SSL 三处端点亦已接入（`SslCertificate.updated_at` 列存在，ssl.py:41）。

## Goals / Non-Goals

**Goals**：四态优先级反转（单点改动）；Route / SSL 补列并全链路透传；既有资源语义零变化。
**Non-Goals**：静态资源五态合并（见 proposal 不做）；发布弹窗/流程改造；SSH 腿。

## Decisions

**D1 优先级反转放组件单点，不引入逐资源配置**
`PublishStatusTag.vue` 模板把 `pending` 分支提到 `isPartial` 之前，一处改动全资源生效；MUST NOT 做成 prop 可配（「可配置的呈现形式」类扩散已有 save-feedback-single-channel 的边界裁决先例）。tooltip 语义不变：pending「配置已修改，发布后生效」、partial「上次发布存在未生效节点，请重新发布」——partial 态在无未下发修改时仍原样呈现。备选「合成标签（待发布+⚠）」被否：UI 更重且两条信息指向同一动作（重新发布），无增量价值。

**D2 判定顺序的语义表述**
新顺序：`未发布`（current_version 为空）→ `待发布`（pending_publish=true）→ `部分失败`（last_publish_status=='partial'）→ `已发布`。关键性质：pending 的输入是「内容相对上次发布已变」；partial 的输入是「上次发布动作的结果」。编辑后 pending 恒真且部分失败的历史结果对当前内容已失效，故 pending 优先；回滚路径（D6 既有裁决：回滚清 partial + updated_at 置位 → pending）在新顺序下行为不变、无需特判。

**D3 补列即接入，零发布编排改动**
Route / SslCertificate 加 `last_publish_status = Column(String(16), nullable=True)` + `COLUMN_MIGRATIONS` 各一行（漏注册 crash-loop，#118）；写回沿用 `publish_resource`/`rollback_resource` 的能力探测，发布编排零改动。列表端点透传：`routes.py` / `cluster_routes.py` 响应项补 `last_publish_status` 字段（schema + 组装处），`cluster_ssl.py` 同款；前端 `RouteList.vue` / `ClusterRoutes.vue` / `SslCertCard.vue` 传 `last-publish-status` prop，`types/index.ts` 对应行类型补可选字段。语义与上游同构（route-management / ssl 相关 spec 的 pending 部分已在既有 capability 表述，本次不重复改）。

**D4 断言反转清单（#217）**
共享组件语义变更，落地前先 grep 全域消费方与既有断言：
- 前端：`useClusterUtils.test.ts`、`RouteList` / `ClusterRoutes` / `UpstreamList` / `PluginConfigList` / `GlobalRuleList` / `PluginMetadataList` / `StreamProxyList` / `DnsUdpProxyList` / `SslCertCard` 相关用例中断言「partial 态在 pending 场景呈现」的断言反转；新增「partial 后编辑 → 待发布」钉住用例（上游 + 路由各一）。
- 后端：`tests/` 中四态推导相关用例（grep `last_publish_status` / `pending_publish` / `发布未完全生效`）逐个核对——列表端点透传新字段的用例补齐（route / ssl 各一组：partial 发布 → 响应带 `'partial'` → 再发布全成功 → 清 NULL）。
- 收口：前端 `npx vitest run --no-file-parallelism` 全量串行；后端全量 + `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（新增写库路径，#31）。

**D5 复用既有分批模式（低风险先批1）**
批1 = 优先级反转（组件 + 注释 + 测试反转，无 schema 变更）；批2 = Route / SSL 补列 + 透传 + 传参（涉 schema/迁移，PG 冒烟收口）。批1 先行可独立验收（用户实测场景立即修复），批2 靠后。

## Risks / Trade-offs

- 反转后「上次发布有失败节点」的信息在编辑场景被隐藏，直到下次发布才重新可见——接受：失败节点明细在发布日志/版本记录仍可查，标签只承担当前内容的行动提示。
- 新列对存量行默认 NULL（= 视同全成功），存量路由/证书的首次重新发布前不显示 partial——符合列语义（NULL = 全部成功/未发布），非缺陷。
- `cluster_ssl.py` 详情端点若不透传该字段，卡片两入口口径可能漂移——透传时列表/详情一并核对（对齐 D3）。
