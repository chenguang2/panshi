## ADDED Requirements

### Requirement: SSL 证书发布状态推导

SSL 证书列表 SHALL 输出 `pending_publish` 布尔（既有三处端点已推导）与 `last_publish_status` 字段；前端 MUST NOT 各自本地推导。

#### Scenario: 列表响应携带发布状态字段
- **WHEN** 前端请求 SSL 证书列表或证书详情
- **THEN** 每条记录 SHALL 携带 `pending_publish` 布尔与 `last_publish_status`（可为 null）
- **AND** 列表与详情 SHALL 携带同一套字段（MUST NOT 单边缺失导致卡片两入口口径漂移）

#### Scenario: 待发布判定
- **WHEN** 证书 `current_version` 非空且 `updated_at` 晚于最近发布时间（publish-map 回查）
- **THEN** `pending_publish` SHALL 为真（编辑/替换证书后自然落入此态）

### Requirement: SSL 证书部分失败状态持久化

发布结果未在全部节点生效时 SHALL 持久化状态，使 SSL 卡片能区分「全部节点成功」与「发布未完全生效」。

#### Scenario: partial 记录与写回单点
- **WHEN** 证书发布到多节点且存在失败节点（部分或全部失败）
- **THEN** `SslCertificate.last_publish_status` SHALL 记录 `'partial'`
- **AND** 写回 SHALL 由 `publish_resource`/`rollback_resource` 既有 `hasattr` 能力探测承担（加列即接入），MUST NOT 在 SSL 端点复制实现
- **AND** 下次发布动作完成后 SHALL 按该次结果更新（全部成功清为 NULL）

#### Scenario: 模型与迁移
- **WHEN** 新增 `SslCertificate.last_publish_status` 列（nullable String(16)）
- **THEN** 该列 SHALL 注册于 `COLUMN_MIGRATIONS`（缺注册将启动 crash-loop）
- **AND** 合入前 SHALL 通过 PG 方言冒烟（`tests/test_pg_dialect_smoke.py`）

### Requirement: SSL 证书发布状态四态展示

SSL 卡片 SHALL 经共享 `PublishStatusTag` 呈现四态，判定顺序与全站一致：未发布 → 待发布 → 部分失败 → 已发布。

#### Scenario: 四态展示
- **WHEN** SSL 卡片渲染发布状态
- **THEN** `未发布`（灰）、`待发布`（橙）、`⚠ vX · 发布未完全生效`（橙红）、`已发布 vX` + 发布时间（绿）SHALL 依次可表达
- **AND** 待发布 SHALL 优先于部分失败：partial 后编辑/替换证书（不发布）SHALL 显示「待发布」而非「发布未完全生效」
