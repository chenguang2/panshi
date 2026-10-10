## Purpose


集群插件配置 Vue 组件（ClusterPluginConfigs）：承载插件配置列表、编辑弹窗与删除交互。
## Requirements
### Requirement: ClusterPluginConfigs component
The system SHALL provide a `ClusterPluginConfigs` component that renders the plugin configs tab content.

#### Scenario: Component renders plugin config list
- **WHEN** `ClusterPluginConfigs` receives `cluster` prop
- **THEN** it SHALL render plugin config cards/table with name, plugins count, version, actions
- **THEN** it SHALL emit `refresh` when plugin configs are modified

### Requirement: 表单跨 Tab 校验反馈

插件组表单（`PluginEntityFormModal`）校验失败时 SHALL 给出可见反馈并把用户带回出错 Tab，MUST NOT 静默失败。

#### Scenario: 跨 Tab 校验失败自动切回
- **WHEN** 用户停留在「插件配置」Tab 提交，且「基础配置」Tab 内字段（名称/所属集群）校验不通过
- **THEN** 表单 SHALL 自动切回「基础配置」Tab
- **AND** SHALL 显示警告提示（如「请完善「基础配置」：名称与所属集群为必填」），MUST NOT 无任何反馈

#### Scenario: 错误详情透出
- **WHEN** 保存请求失败（后端 4xx/5xx 或网络错误）
- **THEN** 错误提示 SHALL 经 `getApiErrorMessage` 透出后端 detail（如「名称长度不能超过 100 个字符」）
- **AND** 无 detail 时 SHALL 回退为「保存失败」并附可操作建议，MUST NOT 只提示四个字的「保存失败」
- **AND** 错误处理 SHALL 与集群子页实现（`useClusterPluginEntity`）对齐，MUST NOT 出现同一动作两套错误文案口径

### Requirement: 表单误关保护

#### Scenario: 有未保存变更时关闭需确认
- **WHEN** 表单存在未保存变更且用户点击关闭/取消/遮罩
- **THEN** SHALL 出现放弃变更确认（对齐 `UpstreamFormModal` 先例），确认后才关闭
- **AND** 无变更时 SHALL 直接关闭，不弹确认

### Requirement: 列表筛选与空态文案

#### Scenario: 筛选下拉语义明确
- **WHEN** 主列表页渲染集群分组筛选下拉
- **THEN** 默认项 SHALL 为「全部集群分组」（明确筛的是集群分组维度），MUST NOT 使用歧义的「全部分组」

#### Scenario: 空态区分与行动引导
- **WHEN** 列表为空
- **THEN** SHALL 区分「暂无插件组」（含「添加插件组」行动按钮）与「无匹配结果」（含「清空筛选」按钮），MUST NOT 两种情况显示同一文案

### Requirement: 路由关联卡片状态语义

#### Scenario: 关联空态指路明确
- **WHEN** 路由表单弹窗的插件组 Tab 无可选插件组
- **THEN** 空态提示 SHALL 指向创建入口的实际位置（「请先在左侧菜单「插件组」页面创建」），MUST NOT 循环指代用户当前所在语境（如「请在“插件组”Tab 中创建」）

#### Scenario: 未发布不显示 v0
- **WHEN** 路由关联卡片渲染未发布插件组
- **THEN** SHALL 显示「未发布」标签，MUST NOT 显示 `v0`（系统中不存在 v0 版本）

### Requirement: 插件组集群子页加载失败与空态区分

插件组集群子页 SHALL 区分「加载失败」「加载中」「空数据」三态（与全局规则集群子页同契约，共享 `useClusterPluginEntity` 失败态语义），MUST NOT 把接口失败吞成空态。

#### Scenario: 加载失败态
- **WHEN** 插件组列表接口请求失败（网络错误、5xx 等）
- **THEN** 页面 SHALL 显示失败提示（含经 `getApiErrorMessage` 透出的原因）与「重试」按钮
- **AND** MUST NOT 显示「暂无插件组」空态文案或引导创建
