## ADDED Requirements

### Requirement: 路由发布状态推导

路由发布状态 SHALL 由后端在两个列表端点（独立页 `GET /api/v1/routes` 与集群 Tab `GET /clusters/{id}/routes`）统一推导并输出 `pending_publish` 布尔与 `last_publish_status` 字段；前端 MUST NOT 各自本地推导（单一事实源，两视图口径必然一致）。`pending_publish` 推导 MUST 沿用 `edge_sync.derive_pending_publish` 共享单点，MUST NOT 另行实现。

#### Scenario: 列表响应携带发布状态字段
- **WHEN** 前端请求路由列表（任一列表端点）
- **THEN** 每条记录 SHALL 携带 `pending_publish` 布尔与 `last_publish_status`（可为 null）
- **AND** `last_publish_status` SHALL 经既有列表响应组装透传，MUST NOT 由前端从其他字段推断

#### Scenario: 待发布判定
- **WHEN** 路由 `current_version` 非空且 `updated_at` 晚于最近发布时间（publish-map 回查）
- **THEN** `pending_publish` SHALL 为真（编辑保存、版本回滚均自然落入此态）

#### Scenario: published_at 缺失守卫
- **WHEN** `current_version` 非空但版本历史已被删光（publish-map 回查 `published_at` 为 None）
- **THEN** `pending_publish` SHALL 为 False，状态显示「已发布 vX」且不带时间
- **AND** 推导 MUST NOT 对 None 执行时间比较（避免 TypeError）

### Requirement: 路由部分失败状态持久化

发布结果未在全部节点生效时 SHALL 持久化状态，使路由列表能区分「全部节点成功」与「发布未完全生效」。

#### Scenario: partial 记录与写回单点
- **WHEN** 路由发布到多节点且存在失败节点（部分或全部失败）
- **THEN** `Route.last_publish_status` SHALL 记录 `'partial'`
- **AND** 写回 SHALL 由 `publish_resource`/`rollback_resource` 既有 `hasattr` 能力探测承担（加列即接入），MUST NOT 在路由端点复制实现
- **AND** 下次发布动作完成后 SHALL 按该次结果更新（全部成功清为 NULL）

#### Scenario: 模型与迁移
- **WHEN** 新增 `Route.last_publish_status` 列（nullable String(16)）
- **THEN** 该列 SHALL 注册于 `COLUMN_MIGRATIONS`（缺注册将启动 crash-loop）
- **AND** 合入前 SHALL 通过 PG 方言冒烟（`tests/test_pg_dialect_smoke.py`）

### Requirement: 路由发布状态四态展示

路由列表 SHALL 经共享 `PublishStatusTag` 呈现四态，判定顺序与全站一致：未发布 → 待发布 → 部分失败 → 已发布。

#### Scenario: 四态展示
- **WHEN** 路由列表渲染发布状态
- **THEN** `未发布`（灰）、`待发布`（橙）、`⚠ vX · 发布未完全生效`（橙红）、`已发布 vX` + 发布时间（绿）SHALL 依次可表达
- **AND** 待发布 SHALL 优先于部分失败：partial 后编辑保存（不发布）SHALL 显示「待发布」而非「发布未完全生效」

#### Scenario: 与集群子页口径一致
- **WHEN** 同一路由分别在独立路由页与集群 Tab 路由子页渲染
- **THEN** 两处 SHALL 显示相同状态（同一后端推导字段）
