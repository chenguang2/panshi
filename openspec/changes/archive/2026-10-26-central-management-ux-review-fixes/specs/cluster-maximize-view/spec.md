# central-management-ux-review-fixes 变更规格 — cluster-maximize-view 域增量

## ADDED Requirements

### Requirement: 刷新保持面板状态

统一管理页的列表刷新 SHALL 保留用户的面板上下文：已展开集群集合、展开顺序、每集群当前 Tab、已加载的子表数据 SHALL 在刷新后保持，MUST NOT 将展开面板 Tab 全量重置回首签（约定 #203 陷阱的全局版）。

#### Scenario: Tab 动作后状态不丢失
- **GIVEN** 用户展开了集群 A（当前 Tab=路由）与集群 B（当前 Tab=节点）
- **WHEN** 在 A 的路由 Tab 内完成任一触发 `@refresh` 的操作
- **THEN** 刷新后 A 仍展开且 Tab 仍为路由（数据更新），B 仍展开且 Tab 仍为节点

#### Scenario: 连接测试后不重置
- **WHEN** 用户对任一集群完成连接测试
- **THEN** 页面刷新 SHALL 保持全部展开面板与 Tab 状态
- **AND** `#203` 面板局部刷新语义（发布成功回调不走父级全量刷新）保持不变

### Requirement: 子表数据按需延迟加载

统一管理页 SHALL 将节点/上游子表数据延迟到对应集群首次需要展示时加载，MUST NOT 在页面挂载时对全部集群并发预加载。

#### Scenario: 挂载仅请求列表
- **WHEN** 统一管理页完成挂载
- **THEN** SHALL 仅发起集群列表请求；节点/上游子表 SHALL 在对应集群首次展开或卡片节点区需要渲染时按需加载
