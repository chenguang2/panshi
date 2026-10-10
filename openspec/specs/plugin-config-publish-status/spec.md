# plugin-config-publish-status

## Purpose

插件组发布状态的后端推导（`pending_publish`）、部分失败持久化与回滚清除（`last_publish_status`）与 `PublishStatusTag` 四态展示语义；前端不做本地推导，两个列表视图口径必然一致。

## Requirements

### Requirement: 发布状态推导

插件组发布状态 SHALL 由后端在两个列表端点统一推导并输出 `pending_publish` 布尔；前端 MUST NOT 各自本地推导（单一事实源，主页面与集群子页必然一致）。

#### Scenario: 列表响应携带 pending_publish
- **WHEN** 前端请求插件组列表（`GET /api/v1/plugin_configs` 或 `GET /api/v1/clusters/{id}/plugin_configs`）
- **THEN** 每条记录 SHALL 携带 `pending_publish` 布尔
- **AND** published_at 回查与 pending 推导 SHALL 收敛在共享 helper（`edge_sync.derive_pending_publish`，两端口径单点，MUST NOT 各自实现）

#### Scenario: 待发布判定
- **WHEN** 插件组 `current_version` 非空且 `updated_at` 晚于最近发布时间（publish-map 回查）
- **THEN** `pending_publish` SHALL 为真（编辑保存、版本回滚均自然落入此态，无需额外标记字段、MUST NOT 特判回滚路径）

#### Scenario: published_at 缺失守卫
- **WHEN** `current_version` 非空但版本历史已被删光（publish-map 回查 `published_at` 为 None）
- **THEN** `pending_publish` SHALL 为 False，状态显示「已发布 vX」且不带时间
- **AND** 推导 MUST NOT 对 None 执行时间比较（避免 TypeError）

#### Scenario: 发布完成对齐时间戳
- **WHEN** `create_config_version` 创建版本（共享单点，插件组发布经 `publish_resource` → 它）
- **THEN** 插件组 `updated_at` SHALL 经既有 `hasattr(entity, "updated_at")` 守卫对齐为本次发布时间戳，发布后 `pending_publish` 为假（复用上游变更已落地的单点，MUST NOT 在插件组端点复制对齐逻辑）

#### Scenario: 四态判定顺序
- **WHEN** 列表渲染发布状态
- **THEN** 判定顺序 SHALL 为：`未发布`（current_version 为空）→ `部分失败`（last_publish_status == 'partial'）→ `待发布`（pending_publish）→ `已发布`

### Requirement: 部分失败状态持久化

插件组发布结果未在全部节点生效（partial，含部分或全部失败）时 SHALL 持久化状态，使列表能区分「全部节点成功」与「发布未完全生效」。

#### Scenario: partial 记录与写回单点
- **WHEN** 发布结果存在失败节点（部分或全部失败）
- **THEN** `PluginConfig.last_publish_status` SHALL 记录 `'partial'`（写回复用 `publish_resource` 内既有 `hasattr(resource, "last_publish_status")` 能力探测单点，MUST NOT 逐资源复制实现）
- **AND** 下次发布动作完成后 SHALL 按该次结果更新（全部成功清为 NULL）

#### Scenario: 回滚清除部分失败标记
- **WHEN** 插件组存在 `last_publish_status == 'partial'` 且用户执行版本回滚
- **THEN** `rollback_resource` SHALL 经 `hasattr(resource, "last_publish_status")` 能力探测清除该字段（置 NULL），状态正确落入「待发布」（回滚后用户需要被提示重新发布）
- **AND** 无此列的资源 SHALL 不受影响（共享单点能力探测，upstream 同路径受益），MUST NOT 逐资源复制清除逻辑

#### Scenario: 模型与迁移
- **WHEN** 新增 `PluginConfig.last_publish_status` 列（nullable String(16)）
- **THEN** 该列 SHALL 注册于 `COLUMN_MIGRATIONS`（缺注册将启动 crash-loop）
- **AND** 合入前 SHALL 通过 PG 方言冒烟（`tests/test_pg_dialect_smoke.py`）

### Requirement: 插件组发布状态四态展示

主列表页与集群子页 SHALL 一致消费 `PublishStatusTag` 四态。

#### Scenario: 四态展示
- **WHEN** 两个页面渲染插件组发布状态标签
- **THEN** `未发布`（灰）、`待发布`（橙，tooltip「配置已修改，发布后生效」）、`⚠ vX · 发布未完全生效`（橙红）、`已发布 vX` + 最近发布时间（绿）SHALL 依次可表达
- **AND** 待发布 SHALL 依据后端 `pending_publish` 字段，部分失败 SHALL 依据 `last_publish_status`，MUST NOT 由「有版本无时间」隐式推导

#### Scenario: 保存后引导发布
- **WHEN** 用户保存（创建或更新）插件组成功——主页面表单与集群子页表单两条保存路径均适用
- **THEN** 成功提示 SHALL 说明「配置尚未发布，需发布后才会在 Edge 节点生效」（对齐上游先例文案），MUST NOT 只提示「已保存/已更新」
- **AND** 保存成功后列表 SHALL 刷新，使「待发布」标签立即可见

### Requirement: 发布确认弹窗可识别目标与新版本

#### Scenario: 确认弹窗标题与版本说明
- **WHEN** 用户对已发布插件组触发发布
- **THEN** 确认弹窗标题 SHALL 携带资源名（「发布插件组: {名称}」）
- **AND** 弹窗内容 SHALL 说明「本次发布将创建新版本 v(N+1)」（N 为当前 `current_version`；未发布时不显示该行）
- **AND** 该说明能力 SHALL 在共享发布确认上以可选参数实现，其他资源调用点默认行为不变

### Requirement: 进度日志状态值本地化

#### Scenario: 节点结果状态值中文显示
- **WHEN** 发布/删除进度弹窗逐节点日志渲染 `results[].status`
- **THEN** SHALL 显示中文映射（`success→成功`、`failed→失败`、`skipped→跳过`、`pending→执行中`；顶层无活跃节点 `error/ok→失败/成功`），以 edge_sync 真实产出为准、与终态汇总用词一致，MUST NOT 原样显示英文枚举值
- **AND** 映射 SHALL 收敛在共享实现（`useClusterUtils`）的展示层，MUST NOT 改变 results 数据结构
