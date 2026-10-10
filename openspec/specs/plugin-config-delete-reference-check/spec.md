# plugin-config-delete-reference-check

## Purpose

插件组删除的前置引用检查：只读引用查询端点与 PLG-07 删除守卫收敛同一判定 helper（同语义单点）；被引用时以阻断式提示替代删除确认，主页面与集群子页行为一致，后端守卫保持兜底。

## Requirements

### Requirement: 删除前置引用查询

插件组删除确认前 SHALL 提供只读引用查询端点，且其判定与删除守卫收敛在同一 helper（确认弹窗展示的引用清单与后端删除拦截永远同语义）。

#### Scenario: 引用查询端点
- **WHEN** 前端请求 `GET /api/v1/clusters/{cluster_id}/plugin_configs/{config_id}/references`
- **THEN** SHALL 返回 `{ name, referenced_by: [{ route_id, route_name }] }`（被同集群路由引用的路由清单）
- **AND** 引用比对 SHALL 复用 PLG-07 守卫抽出的共享 helper：遍历同集群路由、解析 `Route.plugin_config_ids`（JSON TEXT，存 edge_uuid）、比对插件组 `edge_uuid`，MUST NOT 出现两套判定逻辑

#### Scenario: 畸形 JSON 不阻断
- **WHEN** 某路由的 `plugin_config_ids` 为畸形 JSON（解析失败或非列表）
- **THEN** 该路由 SHALL 按「不含引用」处理（与 PLG-07 守卫及 cluster_backup 导入期清理语义一致），MUST NOT 报错阻断

#### Scenario: 鉴权采样
- **WHEN** 新端点注册
- **THEN** `tests/test_security_guard.py` 的 UNAUTHENTICATED_SAMPLES SHALL 补该端点采样（未认证请求 MUST 返回 401）

### Requirement: 被引用时阻断式提示（主页面与集群子页一致）

被引用插件组的删除 SHALL 以阻断式提示替代删除确认（共享确认弹窗不支持禁用勾选，为单一场景扩展共享层不合算），主页面与集群子页 SHALL 行为一致。被引用时不允许任何删除——网关上路由的插件引用会随删除悬空。

#### Scenario: 被引用时阻断提示
- **WHEN** 用户删除一个被 N（>0）条路由引用的插件组
- **THEN** MUST NOT 弹出共享删除确认弹窗，SHALL 改经 `useOverlayModal` 阻断提示（列出引用路由名，超 3 条折叠为「等」，说明需先在路由中解除引用）
- **AND** MUST NOT 提供任何删除入口：平台侧与网关侧均不允许删除（Edge-only 删除会使网关上路由的插件引用悬空），提供操作 SHALL 仅「我知道了」（仅关闭提示，不触发任何删除请求）
- **AND** 主页面与集群子页 SHALL 均接入（集群子页在 composable deps 注入点包装，不改 core 本体）

#### Scenario: 无引用时行为不变
- **WHEN** 用户删除一个无引用的插件组
- **THEN** SHALL 走既有共享删除确认全流程，行为与现状完全一致

#### Scenario: 删除守卫兜底保持
- **WHEN** 前置检查与删除动作之间存在竞态（提示后引用新增）或用户绕过前端直接调删除端点（任意 delete_db/delete_edge 组合，含仅 Edge 侧）
- **THEN** 后端 PLG-07 守卫 SHALL 对任意删除组合均返回 400 及既有文案（前置提示不替代守卫）
