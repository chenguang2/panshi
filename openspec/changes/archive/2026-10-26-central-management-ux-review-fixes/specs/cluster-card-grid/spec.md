# central-management-ux-review-fixes 变更规格 — cluster-card-grid 域增量（批 8 · 设计裁决后）

## MODIFIED Requirements

### Requirement: 集群卡片唯一实现（ClusterCard 组件）

集群卡片解剖 SHALL 由共享组件 `frontend/src/components/ClusterCard.vue` 唯一实现：集群管理页与统一管理页（分组/未分组）的集群卡片 SHALL 渲染该组件，页面不得重新内联卡片模板或复制 `.cl-card*` 样式（源码守卫测试钉死）。标题条 SHALL 为技术身份条：左身份区（集群标识 + 区域微章）由组件固定渲染，页面差异经 `topbar-extra` slot 注入。

#### Scenario: 两页渲染同一组件
- **WHEN** 集群管理页或统一管理页渲染集群卡片
- **THEN** SHALL 使用 ClusterCard 组件渲染（props：`cluster`、`routeBadge`；slots：`topbar-extra`/`actions`/`footer` 注入页面差异）
- **AND** 标题条左身份区 SHALL 由组件固定渲染，SHALL NOT 经 slot 覆盖（旧 `topbar` 具名 slot 删除）

#### Scenario: 路径徽章由页面传入
- **WHEN** 页面已知节点的中继/直连路径状态
- **THEN** 页面 SHALL 计算好 `routeBadge`（`{label, cls}` 或 null）传入组件
- **AND** 组件内 SHALL NOT 发起任何请求（纯展示）

#### Scenario: 副标题回退式二显
- **WHEN** 卡片渲染副标题
- **THEN** 有 `description` 时 SHALL 显示 description
- **AND** 无 `description` 时 SHALL NOT 回退显示「集群标识: {name}」（2026-10-26 批 8 移除：技术身份已恒显于标题条，回退构成重复）

#### Scenario: 标题条技术身份条
- **WHEN** 卡片渲染标题条
- **THEN** 左侧 SHALL 恒显集群标识 `name`：标识图标（CodeOutlined）+ 等宽字体名，SHALL NOT 使用「标识」前缀词（图标即语义）
- **AND** 标题条 SHALL NOT 显示区域（区域经卡片头路径徽章「经中继 · 区域名」表达——区域唯一运营意义是中继路径，SHALL NOT 二处重复）
- **AND** 标题条右端 SHALL 经 `topbar-extra` slot 承载页面差异（统一管理=最大化按钮；集群管理=留空）
- **AND** 标题条 SHALL NOT 显示组名（分组头已承载，避免三重冗余）

#### Scenario: 数字 ID 不常驻展示
- **WHEN** 卡片渲染
- **THEN** 顶栏 SHALL NOT 显示「#数字ID」尾注
- **AND** 数字 ID SHALL 经标题条身份 tooltip 露出（`集群标识（API/管理面使用）: {name} · ID: {id}`）
