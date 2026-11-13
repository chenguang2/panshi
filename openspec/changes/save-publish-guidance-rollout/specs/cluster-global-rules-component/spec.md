## MODIFIED Requirements

### Requirement: 集群子页表单统一共享实现

集群子页的全局规则创建/编辑表单 SHALL 使用 `PluginEntityFormModal` 共享组件，MUST NOT 维护独立手写 modal。

#### Scenario: 表单收敛
- **WHEN** 用户在集群子页创建或编辑全局规则
- **THEN** 表单 SHALL 渲染 `PluginEntityFormModal`（`clusters=[当前集群]`，编辑态禁用集群选择）
- **AND** 误关 dirty 保护、跨 Tab 校验、保存反馈通道（save-publish-guidance-rollout 起：共享组件开启发布引导后为「保存成功」引导弹窗，未开启域为统一保存 toast）SHALL 随共享组件自动继承，MUST NOT 在子页重写
- **AND** 手写 modal 及其死代码 SHALL 移除
