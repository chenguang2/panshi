## Context

在数据对比中，`_compare_plugin_metadata` 使用 `if not edge_data` 判断 edge 上是否存在该插件元数据。Python 中 `not {}` 为 `True`，导致配置为空 `{}` 的 `data_center` 插件被误判为 "only_in_db"。

前端上游高级配置和路由高级匹配的开关只通过 `v-if` 控制显示隐藏，关闭时未重置字段值，导致再次开启仍保留旧配置，不符合"重配置"预期。

## Goals / Non-Goals

**Goals:**
- 修复 `_compare_plugin_metadata` 空 dict 误判，改用 `edge_data is None` 严格判断
- 上游高级配置开关关闭时重置所有高级字段为默认值
- 路由高级匹配开关关闭时重置 vars 为空数组
- 单元测试覆盖开关重置逻辑

**Non-Goals:**
- 不改动后端数据对比的其他逻辑
- 不改动上游/路由的其他表单字段
- 不改动现有 E2E 测试

## Decisions

- **`is None` 替代 `not`**: Python 中 `not {}` 为 `True`，而 `{} is None` 为 `False`。用 `is None` 区分"字段不存在(None)"和"字段存在但为空({})"两种状态
- **watch 监听而非 @change**: 使用 Vue `watch` 监听 `advancedEnabled` / `advancedMatchEnabled` 的变化，比在模板中绑定 `@change` 事件更集中、更易维护
- **关闭时重置一次**: 仅当 `newVal` 为 `false` 时重置。开启时不做额外操作（此时字段已经处于默认值状态）

## Risks / Trade-offs

- ⚠️ 编辑已有记录时，关闭开关会丢失已保存的高级配置值 → 这正好是意图行为（关闭=放弃配置，重开=重新配置）
- 重置后的默认值通过 `showAddUpstreamModal` / `showAddRouteModal` 中的初始化值保持一致
