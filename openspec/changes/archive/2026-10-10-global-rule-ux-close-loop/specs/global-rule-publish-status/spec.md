# global-rule-publish-status Delta

## ADDED Requirements

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
- **THEN** 判定顺序 SHALL 为：`未发布`（current_version 为空）→ `部分失败`（last_publish_status == 'partial'）→ `待发布`（pending_publish）→ `已发布`

### Requirement: 全局规则部分失败状态持久化

全局规则发布结果未在全部节点生效（partial，含部分或全部失败）时 SHALL 持久化状态，使列表能区分「全部节点成功」与「发布未完全生效」。

#### Scenario: partial 记录与写回单点
- **WHEN** 发布结果存在失败节点（部分或全部失败）
- **THEN** `GlobalRule.last_publish_status` SHALL 记录 `'partial'`（写回复用 `publish_resource` 内既有 `hasattr(resource, "last_publish_status")` 能力探测单点，MUST NOT 逐资源复制实现）
- **AND** 下次发布动作完成后 SHALL 按该次结果更新（全部成功清为 NULL）

#### Scenario: 模型与迁移
- **WHEN** 新增 `GlobalRule.last_publish_status` 列（nullable String(16)）
- **THEN** 该列 SHALL 注册于 `COLUMN_MIGRATIONS`（缺注册将启动 crash-loop）
- **AND** 合入前 SHALL 通过 PG 方言冒烟（`tests/test_pg_dialect_smoke.py`）

### Requirement: 全局规则发布状态四态展示

主页面与集群子页 SHALL 一致消费 `PublishStatusTag` 四态，且状态组件 SHALL 唯一。

#### Scenario: 四态展示
- **WHEN** 两个页面渲染全局规则发布状态标签
- **THEN** `未发布`（灰）、`待发布`（橙，tooltip「配置已修改，发布后生效」）、`⚠ vX · 发布未完全生效`（橙红）、`已发布 vX` + 最近发布时间（绿）SHALL 依次可表达
- **AND** 待发布 SHALL 依据后端 `pending_publish` 字段，部分失败 SHALL 依据 `last_publish_status`，MUST NOT 由「有版本无时间」隐式推导

#### Scenario: 状态单一表达
- **WHEN** 主页面卡片渲染发布状态
- **THEN** SHALL 仅以 `PublishStatusTag` 表达状态，MUST NOT 并排「已发布/未发布」badge 或 a-tag 造成双显/三态混排

#### Scenario: 保存后引导发布
- **WHEN** 用户保存（创建或更新）全局规则成功——主页面表单与集群子页表单两条保存路径均适用
- **THEN** 成功提示 SHALL 说明「配置尚未发布，需发布后才会在 Edge 节点生效」（对齐插件组先例文案），MUST NOT 只提示「已保存/已更新」
- **AND** 保存成功后列表 SHALL 刷新，使「待发布」标签立即可见

### Requirement: 发布确认弹窗可识别目标

#### Scenario: 确认弹窗标题携带资源名
- **WHEN** 用户对全局规则触发发布（主页面或集群子页）
- **THEN** 确认弹窗标题 SHALL 携带资源名（「发布全局规则: {名称}」），MUST NOT 只显示静态「发布全局规则」

### Requirement: 未发布与待发布计数摘要

#### Scenario: 工具栏计数
- **WHEN** 主页面列表加载完成
- **THEN** 工具栏计数 SHALL 显示「共 X 个 · 未发布 Y · 待发布 Z」（Y 按 `current_version` 为空统计、Z 按 `pending_publish` 统计）
- **AND** 统计 SHALL 由列表数据本地计算，MUST NOT 发起额外请求

#### Scenario: 截断时计数口径
- **WHEN** 列表数据超过卡片网格单次取数上限（500 条）被截断
- **THEN** 未发布/待发布计数 SHALL 基于已加载数据统计，并与「仅显示前 500 条」截断提示并存，MUST NOT 让计数暗示全量口径
