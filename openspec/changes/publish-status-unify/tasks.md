# Tasks

## 批 1：四态优先级反转（无 schema 变更，低风险先批）

- [ ] 1.1 断言反转清单核对（#217）：grep 前端 `发布未完全生效` / `lastPublishStatus` 断言与后端 `last_publish_status` / `pending_publish` 四态相关用例，产出「反转点」清单（写入本文件附录或 PR 描述）
- [ ] 1.2 TDD RED：前端新增钉住用例——partial 后编辑保存 → 显示「待发布」（上游域用例；组件级优先，页面级至少一处）
- [ ] 1.3 `PublishStatusTag.vue`：`pending` 分支移到 `isPartial` 之前；头注释「判定顺序：未发布 → 部分失败 → 待发布 → 已发布」同步反转为新顺序
- [ ] 1.4 `edge_sync.py::derive_pending_publish` docstring 判定顺序注释同步反转为新顺序
- [ ] 1.5 反转既有断言（按 1.1 清单逐项）并全绿
- [ ] 1.6 批 1 收口：`cd frontend && npx vitest run --no-file-parallelism` 全量串行绿；`cd backend && uv run pytest -k "publish or upstream" -q` 同域回归绿

## 批 2：Route + SSL 补 `last_publish_status`（涉 schema/迁移，PG 冒烟收口）

- [ ] 2.1 TDD RED：后端新用例——路由发布部分失败 → `Route.last_publish_status='partial'` → 列表端点响应携带该字段 → 再发布全成功 → 清 NULL；SSL 同款一组；含「partial 后编辑 → 列表仍带 partial 字段但 pending_publish=true」的语义钉住（判定反转在展示层由批 1 承担）
- [ ] 2.2 `app/models/cluster.py`：`Route` / `SslCertificate` 加 `last_publish_status = Column(String(16), nullable=True)`（带与既有 5 资源同款注释）
- [ ] 2.3 `app/core/migrate.py`：`COLUMN_MIGRATIONS` 注册 `("ps_route", "last_publish_status", "VARCHAR(16)")` 与 SSL 表同款条目（漏注册 crash-loop #118；表名以模型 `__tablename__` 实测为准）
- [ ] 2.4 `routes.py` / `cluster_routes.py`：列表响应 schema 补 `last_publish_status` 可选字段 + 组装处透传（对齐既有 pending 透传点）
- [ ] 2.5 `cluster_ssl.py`：列表与详情响应补 `last_publish_status` 透传（列表/详情成对核对，防口径漂移）
- [ ] 2.6 前端传参：`RouteList.vue` / `clusters/ClusterRoutes.vue` / `SslCertCard.vue` 传 `last-publish-status` prop；`types/index.ts` 路由与 SSL 行类型补 `last_publish_status?: string | null`
- [ ] 2.7 GREEN：后端 2.1 用例全绿
- [ ] 2.8 收口验证：`cd backend && TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（#31 写库路径必跑）；后端全量 pytest 绿；前端全量 `npx vitest run --no-file-parallelism` 绿；`npx vue-tsc -b` 通过
- [ ] 2.9 用户验收路径说明：路由发布选部分节点（或停一个节点后全量发布）产生 partial → 路由列表出现「⚠ vX · 发布未完全生效」→ 编辑保存 → 变「待发布」（与上游行为一致）

## 附录

- 语义不变式：`last_publish_status` 的写回/清除零改动（能力探测单点）；本变更只动「展示层判定顺序」与「两个资源的字段覆盖」。
- 回滚安全：批 1 独立可回滚（纯前端展示）；批 2 加列为 nullable 增列，回滚仅少字段不损数据。
