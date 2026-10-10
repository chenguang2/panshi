# cluster-upstreams-component Delta

## MODIFIED Requirements

### Requirement: ClusterUpstreams component
The system SHALL provide a `ClusterUpstreams` component that renders the upstreams tab content.

#### Scenario: Component renders upstream table
- **WHEN** `ClusterUpstreams` receives `cluster` prop
- **THEN** it SHALL render an `a-table` with upstream name, load balance, targets, publish status, actions columns
- **THEN** targets SHALL display as tags（默认展示前 2 个 + `+N` 折叠），对齐全局上游列表的 target-tag 形态
- **THEN** publish status SHALL 使用 PublishStatusTag（消费后端 `pending_publish`，见 `upstream-publish-status` 能力）
- **THEN** load-balance `ewma` SHALL display as 「延迟最小」
- **THEN** it SHALL emit `refresh` when upstreams are modified

#### Scenario: Multi-select row selection with row-click single select
- **WHEN** the upstreams table is rendered
- **THEN** the table SHALL use multi-select row-selection bound to `cluster.selectedUpstreamKeys`
- **AND** `preserveSelectedRowKeys` SHALL be enabled so checked upstreams persist across pages
- **AND** row click (`customRow` onClick) SHALL set `cluster.selectedUpstream` to the clicked record
- **AND** 勾选恰好 1 行时 SHALL 同步 `cluster.selectedUpstream` 为该行记录（工具栏单选操作即时可用），同步 SHALL 以 `rows[0]` 存在为前提（跨页勾选时 rows 可能只含当前页行，缺失时 SHALL NOT 写单选、单选按钮维持禁用）
- **AND** 勾选 1 行 SHALL 覆盖此前行点选产生的单选（高亮跟随 `selectedUpstream`，无论来源为行点选或勾选）
- **AND** `cluster.selectedUpstream` 非空时对应行 SHALL 高亮，使选中态可见

#### Scenario: Delete button dispatches to batch or single delete
- **WHEN** `selectedUpstreamKeys.length > 0`
- **THEN** the delete button SHALL show "删除上游(N)" where N is the checked count
- **AND** clicking it SHALL trigger `deleteUpstreams(cluster)`
- **WHEN** `selectedUpstreamKeys.length === 0` and a single upstream is selected
- **THEN** the delete button SHALL trigger the existing single-upstream delete flow
- **AND** single-selection buttons (编辑/发布/版本管理) SHALL be disabled when `selectedUpstreamKeys.length >= 2` even if a row is clicked afterwards

## ADDED Requirements

### Requirement: 集群内上游表单交互

集群上游 Tab 的内联表单 SHALL 与全局 `UpstreamFormModal` 保持一致的关键交互语义（保存后发布引导、校验反馈、误关保护、概念 hint）；组件合并另立 change，本需求只约束行为。

#### Scenario: 保存成功提示语义
- **WHEN** 用户在集群内表单保存成功（新建/编辑/复制保存）
- **THEN** toast SHALL 为「已保存。配置尚未发布，需发布后才会在 Edge 节点生效」（与全局表单统一，SHALL NOT 使用「上游已添加」等无发布语义文案）
- **AND** SHALL 弹出与全局一致的「稍后/立即发布」引导

#### Scenario: 校验失败自动切换到首个出错 Tab
- **WHEN** 用户在基础配置 Tab 点击保存且校验失败字段位于高级配置 Tab
- **THEN** 表单 SHALL 自动切换到首个含错误的 Tab 并定位错误提示
- **AND** 界面 SHALL NOT 表现为「点击保存无反应」

#### Scenario: 误关保护
- **WHEN** 表单存在未保存修改且用户点击 × 或「取消」
- **THEN** 系统 SHALL 经 `useOverlayModal` 确认「更改尚未保存，确定放弃？」
- **WHEN** 表单无修改
- **THEN** 关闭 SHALL NOT 出现确认

#### Scenario: 保存按钮文案
- **WHEN** 集群内表单打开（新建或编辑）
- **THEN** 提交按钮 SHALL 统一显示「保存」（与全局表单一致）

#### Scenario: 高级配置概念 hint 与中文占位
- **WHEN** 用户展开高级配置
- **THEN** 一致性哈希 Key SHALL 附 hint（header 填请求头名，cookie 填 Cookie 名）
- **AND** 超时三项 SHALL 附中文 hint 并使用中文占位符（SHALL NOT 使用 `connect/send/read` 英文占位）
- **AND** 权重校验失败 SHALL 提示「权重需为 1-100 的整数」
