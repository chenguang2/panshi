# cluster-panel-scoped-tabs

## Purpose

统一管理最大化面板的 7 个 Tab 各自渲染对应独立页组件（`scopedClusterId` 形态），一份实现两处挂载。本规格约束该形态下仍然成立的行为要求。

## ADDED Requirements

### Requirement: 面板 Tab 渲染独立页组件的 scoped 形态

统一管理面板的每个 Tab SHALL 直接渲染对应独立页组件，并通过 `scopedClusterId` 进入单集群作用域；SHALL NOT 存在第二份面板专属实现。

#### Scenario: 七个 Tab 与独立页一一对应
- **WHEN** 用户在统一管理最大化面板切换 Tab
- **THEN** 「集群节点/上游/路由/插件组/插件元数据/全局规则/静态资源」七个 Tab SHALL 分别渲染 `NodeList` / `UpstreamList` / `RouteList` / `PluginConfigList` / `PluginMetadataList` / `GlobalRuleList` / `StaticResourceList` 的 `scopedClusterId` 形态
- **AND** 仓库内 SHALL NOT 存在 `views/clusters/Cluster*.vue` 或 `components/PluginMetadata.vue`

#### Scenario: scoped 形态隐藏跨集群控件
- **WHEN** 页面组件以 `scopedClusterId` 挂载
- **THEN** 它 SHALL 隐藏页头、分组下拉、集群筛选、分组/平铺切换、分组带、卡片集群徽标与「集群」列
- **AND** 页面级动作 SHALL 收敛为工具条左侧紧凑按钮
- **AND** 状态 chips、批量条、表格/卡片网格、分页条 SHALL 保留

#### Scenario: 切换集群后内容重新加载
- **WHEN** 用户在 mini-bar 切换集群
- **THEN** 当前 Tab 的内容 SHALL 重新加载为目标集群的数据（面板以 `:key="maximizedCluster.id"` 触发重挂载）
- **AND** `activeTab` SHALL 保持

#### Scenario: 写操作成功后通知面板刷新
- **WHEN** scoped 形态下的写操作成功（新建、编辑保存、删除、批量删除、发布、上传、版本回滚）
- **THEN** 组件 SHALL `emit('refresh')`，使面板集群卡片与 Tab 徽标计数立即更新
- **AND** 挂载、翻页、搜索、筛选 SHALL NOT emit

#### Scenario: 列配置存储键按形态分立
- **WHEN** scoped 形态与独立页分别调整列宽/列序
- **THEN** 两者 SHALL 使用不同的存储键（`<res>_panel` 与 `<res>_standalone`），互不污染

### Requirement: 加载失败与空态区分

列表加载失败与「确实没有数据」SHALL 以不同形态呈现，空态 SHALL 给出行动引导。

#### Scenario: 加载失败显示错误态
- **WHEN** 列表请求失败
- **THEN** 页面 SHALL 显示错误说明与重试入口
- **AND** SHALL NOT 显示「暂无数据」类空态文案

#### Scenario: 空态给出行动引导
- **WHEN** 列表请求成功但结果为空
- **THEN** 页面 SHALL 显示空态（图标 + 标题 + 说明 + 行动按钮）
- **AND** 行动按钮 SHALL 打开该资源的创建入口（scoped 形态下集群已锁定）

### Requirement: 面板内表单复用独立页的共享实现

面板内打开的表单 SHALL 与独立页为同一组件；面板 SHALL NOT 复写校验、提交或发布引导。

#### Scenario: 表单字段与独立页一致
- **WHEN** 用户在面板内新建或编辑资源
- **THEN** 表单字段集 SHALL 与独立页同名表单完全一致
- **AND** 「所属集群」SHALL 预选当前集群并禁用编辑

#### Scenario: 保存后发布引导
- **WHEN** 表单保存成功
- **THEN** 系统 SHALL 提示保存成功并提供「立即发布 / 稍后」引导（DNS 查询类路由 SHALL NOT 提供「立即发布」）
- **AND** 该引导 SHALL 由共享表单组件承接，面板与独立页表现一致

#### Scenario: 表单误关保护
- **WHEN** 表单存在未保存变更且用户尝试关闭
- **THEN** 系统 SHALL 二次确认后才关闭

#### Scenario: 校验失败反馈定位
- **WHEN** 提交时校验失败
- **THEN** 表单 SHALL 在对应字段显示错误提示并保持打开
- **AND** 多分组表单 SHALL 自动切回出错的分组并透出错误详情

### Requirement: 面板内行内动作的可见性与禁用语义

行内动作 SHALL 在不可用时禁用并携带原因，SHALL NOT 静默消失或点击后才报错。

#### Scenario: DNS 路由在面板内只读
- **WHEN** 路由 Tab 中的行是 DNS 查询路由
- **THEN** 行内「发布」与「⋯」触发器 SHALL 禁用并带指路 tooltip
- **AND** 该行 SHALL 不被批量删除选中

#### Scenario: 禁用动作携带原因 tooltip
- **WHEN** 某动作因前置条件不满足而禁用（如未上传 ZIP、无历史版本、关联路由已删除）
- **THEN** 该动作 SHALL 通过 `title` 说明原因
- **AND** SHALL NOT 仅置灰而无说明

#### Scenario: 卡片操作与独立页一致
- **WHEN** 卡片类资源（插件组/插件元数据/全局规则/静态资源）在面板内展示
- **THEN** 卡片解剖（`.lp-strip`/`.lp-head`/`.lp-body`/`.lp-foot`）、卡脚「发布 + ⋯」三栏菜单、批量条与状态 chips SHALL 与独立页一致

### Requirement: 面板内不渲染无效选中态

面板 SHALL 只呈现「当前数据确实支持」的选中态，避免误导。

#### Scenario: 无单选来源时不显示选中高亮
- **WHEN** 面板重新加载列表且没有行被点击或勾选
- **THEN** 表格 SHALL NOT 高亮任何行
- **AND** 依赖单选的工具栏动作 SHALL 保持禁用

#### Scenario: 批量勾选与单选同步
- **WHEN** 用户勾选恰好 1 行
- **THEN** 单选态 SHALL 同步为该行（以该行存在于当前页数据为前提）
- **WHEN** 用户勾选 ≥2 行
- **THEN** 单选态 SHALL 清空且单选类动作禁用
