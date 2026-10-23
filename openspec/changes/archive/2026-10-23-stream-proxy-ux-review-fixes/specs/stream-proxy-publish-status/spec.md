# stream-proxy-ux-review-fixes 变更规格

## ADDED Requirements

### Requirement: 四态发布状态推导

四层代理 SHALL 具备与上游/路由域一致的发布状态四态模型：未发布 / 已发布 / 待发布（已发布后被修改）/ ⚠ 发布未完全生效（partial）。`StreamProxy` 模型 SHALL 新增 `last_publish_status` 列（String(20)，nullable）并登记 `COLUMN_MIGRATIONS`；列表与详情端点 SHALL 携带 `pending_publish`（经 `edge_sync.derive_pending_publish` 单点推导）与 `last_publish_status` 字段。发布与回滚链路 SHALL 沿用 `edge_sync` 既有能力探测写入（partial / 清空），MUST NOT 在资源路由内另行实现。

#### Scenario: 编辑已发布代理后呈现待发布
- **GIVEN** 某代理已发布（current_version 非空）
- **WHEN** 用户编辑该代理任意字段并保存
- **THEN** 列表与详情响应 SHALL 返回 `pending_publish=true`
- **AND** 卡片 SHALL 显示「待发布」态（配置已修改，发布后生效）

#### Scenario: 部分发布后呈现未完全生效
- **WHEN** 发布到多节点且部分节点失败
- **THEN** 该代理的 `last_publish_status` SHALL 为 `partial`
- **AND** 卡片 SHALL 显示「⚠ 发布未完全生效」态，可进入失败节点重发布

#### Scenario: 回滚清除发布状态
- **WHEN** 用户对该代理执行版本回滚
- **THEN** `last_publish_status` SHALL 被清空，`pending_publish` SHALL 为 true（待发布）

#### Scenario: 列表与详情响应契约
- **WHEN** 客户端请求列表（`GET /stream-proxies` 全局列表或 `GET /clusters/{id}/stream-proxies`）或详情
- **THEN** 每个条目 SHALL 携带 `pending_publish`（布尔）与 `last_publish_status`（可为 null）
- **AND** `pending_publish` SHALL 由 `edge_sync.derive_pending_publish` 推导，前端 MUST NOT 按时间戳自行实现
