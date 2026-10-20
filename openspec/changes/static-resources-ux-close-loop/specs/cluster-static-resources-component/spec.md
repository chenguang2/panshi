# cluster-static-resources-component Delta

## MODIFIED Requirements

### Requirement: ClusterStaticResources component

The system SHALL provide a `ClusterStaticResources` component that renders the static resources tab content.

#### Scenario: Component renders static resource list
- **WHEN** `ClusterStaticResources` receives `cluster` prop
- **THEN** it SHALL render resource list with file name, size, version, upload time, actions
- **THEN** it SHALL emit `refresh` when static resources are modified

#### Scenario: 卡片操作与独立页一致
- **WHEN** 渲染资源卡片操作区
- **THEN** 操作集合 SHALL 与独立页一致（含「查看 ZIP 内容」入口），SHALL NOT 缺独立页已有的查看能力
- **AND** 操作按钮 SHALL 采用与独立页一致的按钮体系（SHALL NOT 出现两字按钮插空格的 AntDV 形态）
- **AND** 未上传 zip 时「发布」SHALL 禁用并带 title 提示

#### Scenario: 徽章与状态展示一致
- **WHEN** 渲染卡片状态徽章
- **THEN** 徽章语义与形态 SHALL 与独立页一致（分发前中性「已上传 vX」，最终由分发状态徽章五态统一——见 publish-badges）

#### Scenario: 编辑弹窗支持换绑路由
- **WHEN** 用户打开编辑弹窗
- **THEN** 路由选择 SHALL 可用（SHALL NOT 恒只读），不合格路由选项 SHALL 按创建表单同规则禁用标注
- **WHEN** 用户变更所选路由并提交
- **THEN** 前端 SHALL 呈现资格检查即时反馈；提交提示 SHALL 说明「换绑路由后需重新上传并发布到 Edge 节点」
- **WHEN** 目标路由不合格或已关联其它资源
- **THEN** 后端 SHALL 分别返回 400（复用既有三类文案）/ 409（含既有资源名），前端 SHALL 透传
