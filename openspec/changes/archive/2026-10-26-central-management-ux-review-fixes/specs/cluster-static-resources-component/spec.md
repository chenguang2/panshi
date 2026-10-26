# central-management-ux-review-fixes 变更规格 — cluster-static-resources-component 域增量（批 8 · 设计裁决后）

## MODIFIED Requirements

### Requirement: ClusterStaticResources component

The system SHALL provide a `ClusterStaticResources` component that renders the static resources tab content. 行内操作 SHALL 采用「图标 + tooltip」范式（与同面板全局规则 Tab 一致）解决窄容器换行；操作**能力集合** SHALL 与独立页一致（SHALL NOT 缺查看/编辑/发布/版本管理能力），按钮**形态**与独立页的文字按钮体系有意分化（面板容器窄 + 同面板范式统一；独立页容器宽维持文字按钮，如需收敛另立任务）。

#### Scenario: Component renders static resource list
- **WHEN** `ClusterStaticResources` receives `cluster` prop
- **THEN** it SHALL render resource list with file name, size, version, upload time, actions
- **THEN** it SHALL emit `refresh` when static resources are modified

#### Scenario: 卡片操作与独立页一致
- **WHEN** 渲染资源卡片操作区
- **THEN** 操作能力集合 SHALL 与独立页一致（含「查看 ZIP 内容」入口），SHALL NOT 缺独立页已有的查看能力
- **AND** 行内操作 SHALL 采用「图标 + tooltip」范式（与同面板全局规则 Tab 一致）：编辑/上传 ZIP/查看 ZIP 为图标按钮（EditOutlined/UploadOutlined/FolderOpenOutlined），发布与版本管理保持右置文字按钮（发布为主操作）
- **AND** 发布失败态 SHALL 在发布按钮左侧显示重发失败节点图标（SendOutlined，警示色，title=上次发布存在失败节点：仅重发失败节点）
- **AND** 删除 SHALL 为行尾 danger 图标按钮（DeleteOutlined，title=删除）
- **AND** 未上传 zip 时「发布」SHALL 禁用并带 title 提示

#### Scenario: 禁用必须携带原因 tooltip
- **WHEN** 任一操作按钮禁用
- **THEN** SHALL 携带 title 说明原因（broken 态=关联路由不存在，请删除该资源或重建路由；未上传 ZIP=暂未上传 ZIP 文件；未保存资源=请先保存资源后再上传；无版本=暂无版本，请先上传 ZIP）
- **AND** broken 态下除删除外全部禁用，删除保持可用（7.3 定案语义不变）

#### Scenario: 徽章与状态展示一致
- **WHEN** 渲染卡片状态徽章
- **THEN** 徽章语义与形态 SHALL 与独立页一致（分发前中性「已上传 vX」，最终由分发状态徽章五态统一——见 publish-badges）

#### Scenario: 编辑弹窗支持换绑路由
- **WHEN** 编辑静态资源
- **THEN** 弹窗 SHALL 支持换绑路由（route 选择）
