# cluster-global-rules-component Delta

## ADDED Requirements

### Requirement: 集群子页表单统一共享实现

集群子页的全局规则创建/编辑表单 SHALL 使用 `PluginEntityFormModal` 共享组件，MUST NOT 维护独立手写 modal。

#### Scenario: 表单收敛
- **WHEN** 用户在集群子页创建或编辑全局规则
- **THEN** 表单 SHALL 渲染 `PluginEntityFormModal`（`clusters=[当前集群]`，编辑态禁用集群选择）
- **AND** 误关 dirty 保护、跨 Tab 校验、统一保存 toast SHALL 随共享组件自动继承，MUST NOT 在子页重写
- **AND** 手写 modal 及其死代码 SHALL 移除

### Requirement: 集群子页加载失败与空态区分

集群子页 SHALL 区分「加载失败」「加载中」「空数据」三态，MUST NOT 把接口失败吞成空态。

#### Scenario: 加载失败态
- **WHEN** 全局规则列表接口请求失败（网络错误、5xx 等）
- **THEN** 页面 SHALL 显示失败提示（含经 `getApiErrorMessage` 透出的原因）与「重试」按钮
- **AND** MUST NOT 显示「暂无全局规则」空态文案或引导创建

#### Scenario: 空态行动引导
- **WHEN** 列表接口成功但无任何全局规则
- **THEN** SHALL 显示「暂无全局规则」与「添加全局规则」行动按钮（集群子页无筛选器，「无匹配/清空筛选」分支属主页面，见 `global-rule-list-page`）

### Requirement: 集群子页不渲染无效选中态

集群子页卡片 SHALL NOT 呈现无消费方的选中高亮。

#### Scenario: 移除误导性选中
- **WHEN** 用户点击集群子页的全局规则卡片
- **THEN** 卡片 MUST NOT 进入对任何操作无影响的选中高亮态（当前 `selectedGlobalRule` 高亮无消费方，属视觉误导）
