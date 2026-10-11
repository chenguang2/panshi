# plugin-metadata-publish-status

## Purpose

插件元数据发布状态的后端推导（`pending_publish`/`published_at` 经 `ConfigVersion` 历史回查）、部分失败持久化与回滚清除（`last_publish_status`）、回滚编排共享单点收敛与 `PublishStatusTag` 四态展示语义；前端不做本地推导，独立页与统一管理 Tab 口径必然一致。

## Requirements

### Requirement: 插件元数据发布状态推导

插件元数据的两个列表端点 SHALL 经共享 helper 推导发布状态，前端 MUST NOT 本地推导。

#### Scenario: 列表响应携带发布状态字段
- **WHEN** 调用 `GET /clusters/{id}/plugin-metadata` 或 `GET /api/v1/plugin_metadata`
- **THEN** 每条响应包含 `pending_publish`（bool）、`published_at`（发布时间，来自 `ConfigVersion` 历史回查）、`last_publish_status`（既有列序列化，可为 null）

#### Scenario: 编辑后进入待发布
- **WHEN** 已有发布版本的插件元数据被编辑（`PUT /clusters/{id}/plugin-metadata/{plugin_name}`）
- **THEN** 列表响应 `pending_publish=True`

#### Scenario: 发布后回到已同步
- **WHEN** 插件元数据发布成功（版本创建 + 节点推送）
- **THEN** 列表响应 `pending_publish=False` 且 `published_at` 为本次发布时间（非 `updated_at` 编辑时间）

#### Scenario: 版本历史为空守卫
- **WHEN** 插件元数据从未发布或版本历史被删空
- **THEN** 推导守卫生效，`pending_publish=False`、`published_at=None`，接口不报错

### Requirement: 插件元数据发布状态四态展示

两个入口（独立页、统一管理 Tab）SHALL 使用 `PublishStatusTag` 组件单一表达发布状态，MUST NOT 出现 badge 双显或第三种状态文本表达。

#### Scenario: 四态单一表达
- **WHEN** 任一入口渲染插件元数据状态
- **THEN** 仅显示 `PublishStatusTag` 四态之一：未发布 / 待发布 / 发布未完全生效（⚠）/ 已发布 vX + 真实发布时间
- **AND** `publishedAt` 传入发布时间回查值，MUST NOT 传入 `updated_at`

#### Scenario: 两入口参数一致
- **WHEN** 独立页与统一管理 Tab 渲染同一份插件元数据
- **THEN** `PublishStatusTag` 收到相同语义的 `version` / `publishedAt` / `pending` / `lastPublishStatus` 参数

### Requirement: 插件元数据部分失败状态

部分节点发布失败时 SHALL 显示「发布未完全生效」，且发布共享单点的能力探测自动写回（不新增列、不复制实现）。

#### Scenario: partial 状态展示与恢复
- **WHEN** 发布存在失败节点（`last_publish_status='partial'`）
- **THEN** 状态显示「⚠ 发布未完全生效」（partial 优先于待发布判定）
- **AND** 再次发布全部成功后 `last_publish_status` 清 NULL
- **AND** 回滚版本后 `last_publish_status` 清 NULL 且 `pending_publish=True`（引导重新发布）

### Requirement: 插件元数据回滚编排收敛共享单点

插件元数据回滚 SHALL 经共享 `rollback_resource` 单点执行，部分失败状态随回滚清除。

#### Scenario: partial 后回滚进入待发布
- **WHEN** 发布存在失败节点（`last_publish_status='partial'`）后用户回滚到历史版本
- **THEN** `last_publish_status` 清 NULL 且 `pending_publish=True`
- **AND** 状态显示「待发布」，MUST NOT 显示「发布未完全生效」（避免 partial 掩盖重新发布提示）
- **AND** 回滚编排经共享单点执行，MUST NOT 内联复制

#### Scenario: 回滚到当前版本为 no-op
- **WHEN** API 层回滚版本号等于当前版本
- **THEN** 接受为 no-op（无配置与状态变化），不额外守卫
- **AND** UI 层仅允许回滚非当前版本

### Requirement: 插件元数据发布状态已知边界

以下边界为全资源既有共享语义，插件元数据域 MUST NOT 特判。

#### Scenario: 零活跃节点发布
- **WHEN** 集群无活跃节点（或发布目标节点全部无效）时发布
- **THEN** 版本快照仍创建，但无节点实际生效
- **AND** 状态显示「已发布 vX」（共享 skipped 语义），发布响应报告无节点错误

#### Scenario: 发布后新增节点
- **WHEN** 发布完成后集群新增节点
- **THEN** 新节点不自动回填该插件元数据，状态仍显示「已发布」
