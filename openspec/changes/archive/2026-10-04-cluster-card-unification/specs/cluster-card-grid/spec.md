# cluster-card-grid Delta

## ADDED Requirements

### Requirement: 集群卡片唯一实现（ClusterCard 组件）

集群卡片解剖 SHALL 由共享组件 `frontend/src/components/ClusterCard.vue` 唯一实现：集群管理页与统一管理页（分组/未分组）的集群卡片 SHALL 渲染该组件，页面不得重新内联卡片模板或复制 `.cl-card*` 样式（源码守卫测试钉死）。

#### Scenario: 两页渲染同一组件

- **WHEN** 集群管理页或统一管理页渲染集群卡片
- **THEN** SHALL 使用 ClusterCard 组件渲染（props：`cluster`、`routeBadge`；slots：`topbar`/`actions`/`footer` 注入页面差异）

#### Scenario: 路径徽章由页面传入

- **WHEN** 页面已知节点的中继/直连路径状态
- **THEN** 页面 SHALL 计算好 `routeBadge`（`{label, cls}` 或 null）传入组件
- **AND** 组件内 SHALL NOT 发起任何请求（纯展示）

#### Scenario: 副标题回退式二显

- **WHEN** 卡片渲染副标题
- **THEN** 有 `description` 时 SHALL 显示 description
- **AND** 无 description 时 SHALL 回退显示「集群标识: {name}」
- **AND** 两页 SHALL 走同一回退规则

#### Scenario: 数字 ID 不常驻展示

- **WHEN** 卡片渲染
- **THEN** 顶栏 SHALL NOT 显示「#数字ID」尾注
- **AND** 数字 ID SHALL 经卡片标题 hover tooltip 露出（集群名 · ID: N，无展示名回退 name）
