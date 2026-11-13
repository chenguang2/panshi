## MODIFIED Requirements

### Requirement: 全局规则发布状态推导

全局规则发布状态 SHALL 由后端在两个列表端点统一推导并输出 `pending_publish` 布尔；前端 MUST NOT 各自本地推导（单一事实源，主页面与集群子页必然一致）。

#### Scenario: 列表响应携带 pending_publish
- **WHEN** 前端请求全局规则列表（`GET /api/v1/global_rules` 或 `GET /api/v1/clusters/{id}/global_rules`）
- **THEN** 每条记录 SHALL 携带 `pending_publish` 布尔
- **AND** published_at 回查与 pending 推导 SHALL 收敛在共享 helper（`edge_sync.derive_pending_publish`，两端口径单点，MUST NOT 各自实现）

#### Scenario: 待发布判定
- **WHEN** 全局规则 `current_version` 非空且 `updated_at` 晚于最近发布时间（publish-map 回查）
- **THEN** `pending_publish` SHALL 为真（编辑保存、版本回滚均自然落入此态，无需额外标记字段、MUST NOT 特判回滚路径）

#### Scenario: published_at 缺失守卫
- **WHEN** `current_version` 非空但版本历史已被删光（publish-map 回查 `published_at` 为 None）
- **THEN** `pending_publish` SHALL 为 False，状态显示「已发布 vX」且不带时间
- **AND** 推导 MUST NOT 对 None 执行时间比较（避免 TypeError）

#### Scenario: 发布完成对齐时间戳
- **WHEN** `create_config_version` 创建版本（共享单点，全局规则发布经 `publish_resource` → 它）
- **THEN** 全局规则 `updated_at` SHALL 经既有 `hasattr(entity, "updated_at")` 守卫对齐为本次发布时间戳，发布后 `pending_publish` 为假（复用既有单点，MUST NOT 在全局规则端点复制对齐逻辑）

#### Scenario: 四态判定顺序
- **WHEN** 列表渲染发布状态
- **THEN** 判定顺序 SHALL 为：`未发布`（current_version 为空）→ `待发布`（pending_publish）→ `部分失败`（last_publish_status == 'partial'）→ `已发布`
- **AND** 待发布 SHALL 优先于部分失败（publish-status-unify 裁决：内容已变后「待发布」是主导事实，重新发布成功即两态清除）

#### Scenario: 部分失败后编辑保存呈现待发布
- **GIVEN** 某全局规则上次发布存在失败节点（`last_publish_status='partial'`）
- **WHEN** 用户编辑该全局规则任意字段并保存（不发布）
- **THEN** 列表 SHALL 显示「待发布」态（MUST NOT 继续显示「发布未完全生效」）
