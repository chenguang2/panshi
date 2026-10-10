# upstream-publish-status Delta

## ADDED Requirements

### Requirement: 发布状态推导

上游发布状态 SHALL 由后端在两个列表端点统一推导并输出 `pending_publish` 布尔；前端 MUST NOT 各自本地推导（单一事实源，全局页与集群子页必然一致）。

#### Scenario: 列表响应携带 pending_publish
- **WHEN** 前端请求上游列表（`GET /api/v1/upstreams` 或 `GET /api/v1/clusters/{id}/upstreams`）
- **THEN** 每条记录 SHALL 携带 `pending_publish` 布尔
- **AND** published_at 回查与 pending 推导 SHALL 收敛在共享 helper（两端口径单点，MUST NOT 各自实现）

#### Scenario: 待发布判定
- **WHEN** 上游 `current_version` 非空且 `published_at` 可查且 `updated_at` 晚于最近发布时间（`published_at`，publish-map 回查）
- **THEN** `pending_publish` SHALL 为真（编辑保存、版本恢复均自然落入此态，无需额外标记字段）

#### Scenario: published_at 缺失守卫
- **WHEN** `current_version` 非空但版本历史已被删光（publish-map 回查 `published_at` 为 None）
- **THEN** `pending_publish` SHALL 为 False，状态显示「已发布 vX」且不带时间
- **AND** 推导 MUST NOT 对 None 执行时间比较（避免 TypeError）
- **AND** 删除的版本为最新版本时，`published_at` 回落为剩余最新版本时间，按一般规则推导，MUST NOT 特判

#### Scenario: 发布完成对齐时间戳
- **WHEN** `create_config_version` 创建版本（置 `current_version` + commit 的共享单点，`publish_resource` 与 edge.env 发布均经它）
- **THEN** 系统 SHALL 在同一事务内以 `hasattr(entity, "updated_at")` 守卫将资源 `updated_at` 显式对齐为本次发布时间戳（显式赋值优先于 onupdate）
- **AND** 无 `updated_at` 列的模型（如 StreamProxy/SslCertificate）SHALL 跳过对齐，MUST NOT 报错
- **AND** 发布后 `pending_publish` SHALL 为假，列表显示「已发布」

#### Scenario: 四态判定顺序
- **WHEN** 列表渲染发布状态
- **THEN** 判定顺序 SHALL 为：`未发布`（current_version 为空）→ `部分失败`（last_publish_status == 'partial'）→ `待发布`（pending_publish）→ `已发布`

### Requirement: 部分失败状态持久化

发布结果未在全部节点生效（partial，含部分或全部失败）时 SHALL 持久化状态，使列表能区分「全部节点成功」与「发布未完全生效」，MUST NOT 让 partial 发布后的行与全成功行显示一致。

#### Scenario: partial 记录
- **WHEN** 发布结果存在失败节点（部分或全部失败）
- **THEN** 上游 `last_publish_status` SHALL 记录 `'partial'`（版本记录在节点尝试之前创建，全失败亦产生版本——版本=配置快照而非部署凭证）
- **AND** 下次发布动作完成后 SHALL 按该次结果更新（全部成功清为 NULL）

#### Scenario: 模型与迁移
- **WHEN** 新增 `Upstream.last_publish_status` 列（nullable String(16)）
- **THEN** 该列 SHALL 注册于 `COLUMN_MIGRATIONS`（缺注册将启动 crash-loop）
- **AND** 合入前 SHALL 通过 PG 方言冒烟（`tests/test_pg_dialect_smoke.py`）

#### Scenario: 写回在共享实现单点
- **WHEN** `publish_resource` 写回 `last_publish_status`
- **THEN** SHALL 以 `hasattr(resource, 'last_publish_status')` 能力探测，MUST NOT 逐资源复制实现（其他资源后续加同名列即可接入）

### Requirement: PublishStatusTag 四态

`PublishStatusTag` SHALL 支持四态展示，取代现有实际不可达的「v·未同步」分支语义。

#### Scenario: 四态展示
- **WHEN** 列表渲染发布状态标签
- **THEN** `未发布`（灰，current_version 为空）、`待发布`（橙，tooltip「配置已修改，发布后生效」）、`已发布 vX` + 最近发布时间（绿，`published_at` 查无时不带时间）、`⚠ vX · 发布未完全生效`（橙红，部分或全部节点失败均落此态）SHALL 依次可表达

#### Scenario: 消费方式
- **WHEN** 上游列表消费该组件
- **THEN** 待发布 SHALL 依据后端 `pending_publish` 判定，部分失败 SHALL 依据 `last_publish_status`
- **AND** `pending` SHALL 为消费方显式传入的 prop，组件 MUST NOT 由「有版本无时间」隐式推导待发布（其他资源的同步语义 ≠ 待发布）
- **AND** 其他资源类型 SHALL 可继续使用既有三态（「v·未同步」分支仅为未接入 pending 的资源保留；pending/部分失败为可选能力，按资源逐步接入）
